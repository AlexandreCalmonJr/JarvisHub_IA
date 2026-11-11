"""Cliente MCP sobre stdio (JSON-RPC 2.0, mensagens delimitadas por linha).

Implementa o subconjunto necessário para o Coding Agent: handshake
``initialize``, descoberta via ``tools/list`` e execução via ``tools/call``.

O processo do servidor MCP é sempre local e iniciado apenas quando há
configuração explícita em ``data/mcp_servers.json``.
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
import shutil
from typing import Any

from .types import McpServerConfig, McpToolInfo, McpToolOutcome

logger = logging.getLogger("jarvis.mcp.client")

PROTOCOL_VERSION = "2024-11-05"
MAX_LINE_BYTES = 4_000_000


class McpError(RuntimeError):
    """Falha de protocolo ou de transporte com um servidor MCP."""


def _build_argv(command: str, args: list[str]) -> list[str]:
    """No Windows, comandos ``.cmd``/``.bat`` precisam do interpretador ``cmd``."""
    executable = command
    if os.name == "nt" and not command.lower().endswith(".exe"):
        resolved = shutil.which(command)
        if resolved and resolved.lower().endswith((".cmd", ".bat")):
            executable = resolved
            return ["cmd", "/c", executable, *args]
    return [executable, *args]


class McpStdioClient:
    """Ciclo de vida e chamadas de um servidor MCP via stdio."""

    def __init__(self, config: McpServerConfig):
        self.config = config
        self.process: asyncio.subprocess.Process | None = None
        self._lock = asyncio.Lock()
        self._next_id = 0
        self._stderr_tail: list[str] = []
        self._stderr_task: asyncio.Task | None = None
        self.server_info: dict[str, Any] = {}

    # ------------------------------------------------------------------
    # Ciclo de vida
    # ------------------------------------------------------------------
    @property
    def running(self) -> bool:
        return self.process is not None and self.process.returncode is None

    async def start(self) -> None:
        if self.running:
            return
        env = os.environ.copy()
        env.update({str(k): str(v) for k, v in self.config.env.items()})
        argv = _build_argv(self.config.command, list(self.config.args))
        try:
            self.process = await asyncio.create_subprocess_exec(
                *argv,
                stdin=asyncio.subprocess.PIPE,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
                cwd=self.config.cwd or None,
                env=env,
                limit=MAX_LINE_BYTES,
            )
        except FileNotFoundError as exc:
            raise McpError(
                f"Comando do servidor MCP '{self.config.id}' não encontrado: {self.config.command}"
            ) from exc
        except Exception as exc:
            raise McpError(
                f"Falha ao iniciar o servidor MCP '{self.config.id}': {exc}"
            ) from exc

        self._stderr_task = asyncio.create_task(self._drain_stderr())
        try:
            await self._request(
                "initialize",
                {
                    "protocolVersion": PROTOCOL_VERSION,
                    "capabilities": {},
                    "clientInfo": {"name": "jarvis-ai-hub", "version": "1.0.0"},
                },
                timeout=min(30.0, self.config.timeout_seconds),
            )
            await self._notify("notifications/initialized", {})
        except Exception:
            await self.close()
            raise

    async def close(self) -> None:
        if self._stderr_task is not None:
            self._stderr_task.cancel()
            self._stderr_task = None
        process = self.process
        self.process = None
        if process is None:
            return
        if process.stdin is not None:
            try:
                process.stdin.close()
            except Exception:
                logger.debug("Falha ao fechar stdin do servidor MCP.", exc_info=True)
        try:
            if process.returncode is None:
                process.terminate()
                try:
                    await asyncio.wait_for(process.wait(), timeout=3.0)
                except TimeoutError:
                    process.kill()
                    await process.wait()
        except ProcessLookupError:
            pass
        except Exception as exc:  # pragma: no cover - defensivo
            logger.debug("Falha ao encerrar servidor MCP %s: %s", self.config.id, exc)

    # ------------------------------------------------------------------
    # Protocolo
    # ------------------------------------------------------------------
    async def _write(self, payload: dict[str, Any]) -> None:
        if not self.running or self.process is None or self.process.stdin is None:
            raise McpError(f"Servidor MCP '{self.config.id}' não está em execução.")
        data = json.dumps(payload, ensure_ascii=False).encode("utf-8") + b"\n"
        self.process.stdin.write(data)
        await self.process.stdin.drain()

    async def _notify(self, method: str, params: dict[str, Any]) -> None:
        await self._write({"jsonrpc": "2.0", "method": method, "params": params})

    async def _read_message(self, timeout: float) -> dict[str, Any]:
        if self.process is None or self.process.stdout is None:
            raise McpError(f"Servidor MCP '{self.config.id}' não está em execução.")
        loop = asyncio.get_running_loop()
        deadline = loop.time() + timeout
        while True:
            remaining = deadline - loop.time()
            if remaining <= 0:
                raise McpError(
                    f"Tempo limite excedido ao aguardar resposta do servidor MCP '{self.config.id}'."
                )
            try:
                line = await asyncio.wait_for(
                    self.process.stdout.readline(), timeout=remaining
                )
            except TimeoutError as exc:
                raise McpError(
                    f"Tempo limite excedido ao aguardar resposta do servidor MCP '{self.config.id}'."
                ) from exc
            if not line:
                raise McpError(
                    f"Servidor MCP '{self.config.id}' encerrou a conexão. "
                    f"{self._stderr_hint()}"
                )
            if len(line) > MAX_LINE_BYTES:
                raise McpError("Resposta MCP excedeu o limite de tamanho.")
            text = line.decode("utf-8", errors="replace").strip()
            if not text:
                continue
            try:
                message = json.loads(text)
            except json.JSONDecodeError:
                logger.debug("Linha não-JSON do MCP %s: %s", self.config.id, text[:200])
                continue
            if isinstance(message, dict):
                return message

    async def _request(
        self,
        method: str,
        params: dict[str, Any],
        timeout: float | None = None,
    ) -> dict[str, Any]:
        async with self._lock:
            self._next_id += 1
            request_id = self._next_id
            await self._write(
                {
                    "jsonrpc": "2.0",
                    "id": request_id,
                    "method": method,
                    "params": params,
                }
            )
            limit = timeout or self.config.timeout_seconds
            while True:
                message = await self._read_message(limit)
                if message.get("id") != request_id:
                    # Notificação ou resposta antiga: ignora com segurança.
                    continue
                if "error" in message:
                    error = message.get("error") or {}
                    raise McpError(
                        f"MCP '{self.config.id}' retornou erro em {method}: "
                        f"{error.get('message', error)}"
                    )
                return message.get("result") or {}

    # ------------------------------------------------------------------
    # Operações
    # ------------------------------------------------------------------
    async def initialize(self) -> dict[str, Any]:
        await self.start()
        return self.server_info

    async def list_tools(self) -> list[McpToolInfo]:
        await self.start()
        result = await self._request("tools/list", {})
        tools: list[McpToolInfo] = []
        for item in result.get("tools") or []:
            name = str(item.get("name") or "").strip()
            if not name:
                continue
            tools.append(
                McpToolInfo(
                    server_id=self.config.id,
                    name=name,
                    description=str(item.get("description") or ""),
                    input_schema=item.get("inputSchema") or {"type": "object", "properties": {}},
                )
            )
        return tools

    async def call_tool(self, name: str, arguments: dict[str, Any]) -> McpToolOutcome:
        await self.start()
        try:
            result = await self._request(
                "tools/call", {"name": name, "arguments": arguments or {}}
            )
        except McpError as exc:
            return McpToolOutcome(success=False, error=str(exc))

        is_error = bool(result.get("isError"))
        parts: list[str] = []
        for block in result.get("content") or []:
            if isinstance(block, str):
                parts.append(block)
                continue
            if block.get("type") == "text":
                parts.append(str(block.get("text") or ""))
            elif block.get("type") == "resource":
                resource = block.get("resource") or {}
                parts.append(str(resource.get("text") or resource.get("uri") or ""))
            else:
                parts.append(json.dumps(block, ensure_ascii=False))
        output = "\n".join(part for part in parts if part)
        if is_error:
            return McpToolOutcome(success=False, output=output, error=output or "Ferramenta MCP falhou.")
        return McpToolOutcome(success=True, output=output or "(sem saída)")

    async def _drain_stderr(self) -> None:
        if self.process is None or self.process.stderr is None:
            return
        try:
            while True:
                line = await self.process.stderr.readline()
                if not line:
                    break
                text = line.decode("utf-8", errors="replace").strip()
                if text:
                    self._stderr_tail.append(text)
                    del self._stderr_tail[:-40]
        except asyncio.CancelledError:
            raise
        except Exception:
            logger.debug("Leitor de stderr do servidor MCP terminou com erro.", exc_info=True)

    def _stderr_hint(self) -> str:
        if not self._stderr_tail:
            return ""
        return "stderr: " + " | ".join(self._stderr_tail[-3:])
