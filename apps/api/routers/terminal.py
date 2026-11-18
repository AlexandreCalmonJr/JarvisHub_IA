"""Router de Terminal PTY Interativo via WebSocket (estilo Cursor / Devin / Cloud9).

Permite comunicação bidirecional em tempo real com um subprocesso interativo
(PowerShell no Windows / bash no Unix) conectado ao frontend via WebSocket.

Governança: o handshake HTTP do WebSocket não passa pelo ``AuthMiddleware``
(só ``scope["type"] == "http"``), por isso a autenticação é feita aqui, de forma
explícita e fail-closed, antes de qualquer subprocesso ser criado. O terminal
aceita apenas utilizadores humanos com a permissão ``coding:use`` e apenas
diretórios de projeto pertencentes à conta autenticada (ou qualquer projeto
registado, no caso de administradores).
"""

from __future__ import annotations

import asyncio
import logging
import sys
from pathlib import Path

from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from starlette.requests import Request

from apps.api.auth import Principal, auth_service
from apps.api.deps import db_manager, security_core, workspace_service

logger = logging.getLogger("jarvis.api.terminal")
router = APIRouter(prefix="/api/v1/terminal", tags=["terminal"])

# Política do canal: abrir shell exige permissão de uso do Coding Agent.
TERMINAL_PERMISSION = "coding:use"
# Sessões ociosas são encerradas para não deixar processos órfãos.
IDLE_TIMEOUT_SECONDS = 30 * 60
# Tamanho de cada leitura do PTY em bytes.
READ_CHUNK_BYTES = 4096

WS_POLICY_VIOLATION = 1008


def _resolve_shell() -> list[str]:
    """Comando fixo (sem ``shell=True`` e sem interpolação) por plataforma."""
    if sys.platform == "win32":
        return ["powershell.exe", "-NoLogo", "-NoProfile"]
    for candidate in ("/bin/bash", "/bin/sh"):
        if Path(candidate).exists():
            return [candidate]
    return ["/bin/sh"]


def _authenticate(websocket: WebSocket) -> Principal | None:
    """Reutiliza a autenticação HTTP (cookie de sessão ou Bearer) para o WS."""
    try:
        # ``Request`` exige scope HTTP; o handshake WS traz a mesma estrutura de
        # headers/cookies, por isso reutilizamos a cadeia de autenticação sem
        # duplicar regras de token, sessão e dispositivo.
        scope = dict(websocket.scope)
        scope["type"] = "http"
        principal = auth_service.authenticate(Request(scope))
    except Exception:  # pragma: no cover - defensivo
        logger.warning("Falha ao autenticar handshake do terminal.", exc_info=True)
        return None
    if principal is None:
        return None
    # Somente contas humanas abrem shell; dispositivos pareados não.
    if principal.kind != "human":
        return None
    if not principal.has(TERMINAL_PERMISSION):
        return None
    return principal


def _resolve_workdir(project_id: str | None, principal: Principal) -> Path:
    """Diretório de trabalho: projeto autorizado ou a raiz do workspace."""
    base = workspace_service.base_dir.resolve()
    if not project_id:
        return base
    if (
        principal.role != "admin"
        and db_manager.get_project(project_id, owner_user_id=principal.subject_id) is None
    ):
        raise PermissionError("Projeto inexistente ou não pertence à conta autenticada.")
    target = workspace_service.get_project_dir(project_id).resolve()
    try:
        target.relative_to(base)
    except ValueError as exc:
        raise PermissionError("Diretório do projeto fora da raiz autorizada.") from exc
    if not target.is_dir():
        raise PermissionError("Diretório do projeto não encontrado.")
    return target


@router.websocket("/ws")
async def terminal_websocket_endpoint(
    websocket: WebSocket,
    project_id: str | None = None,
):
    """Sessão de terminal interativo autenticada e auditada."""
    principal = _authenticate(websocket)
    if principal is None:
        security_core.audit.record_event(
            operation="TERMINAL_WS_AUTH",
            status="DENIED",
            user_id="anonymous",
            parameters={"path": str(websocket.url.path)},
            reason="Handshake de terminal rejeitado: credencial ausente, inválida ou sem permissão.",
        )
        await websocket.close(code=WS_POLICY_VIOLATION)
        return

    try:
        work_dir = _resolve_workdir(project_id, principal)
    except PermissionError as exc:
        security_core.audit.record_event(
            operation="TERMINAL_WS_PROJECT",
            status="DENIED",
            user_id=principal.display_id,
            project_id=project_id,
            reason=str(exc),
        )
        await websocket.close(code=WS_POLICY_VIOLATION, reason="Projeto não autorizado.")
        return

    await websocket.accept()

    try:
        proc = await asyncio.create_subprocess_exec(
            *_resolve_shell(),
            stdin=asyncio.subprocess.PIPE,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.STDOUT,
            cwd=str(work_dir),
        )
    except Exception as exc:
        logger.error("Falha ao iniciar processo de terminal: %s", exc)
        await websocket.send_text(f"\r\n[Erro ao iniciar shell: {exc}]\r\n")
        await websocket.close()
        return

    security_core.audit.record_event(
        operation="TERMINAL_WS_OPENED",
        status="SUCCESS",
        user_id=principal.display_id,
        project_id=project_id,
        parameters={"pid": proc.pid, "cwd": str(work_dir)},
    )
    logger.info(
        "Terminal interativo iniciado (PID %d) em %s por %s",
        proc.pid,
        work_dir,
        principal.display_id,
    )

    async def forward_stdout():
        try:
            while True:
                if proc.stdout is None:
                    break
                chunk = await proc.stdout.read(READ_CHUNK_BYTES)
                if not chunk:
                    break
                await websocket.send_text(chunk.decode(errors="replace"))
        except asyncio.CancelledError:
            pass
        except Exception as exc:
            logger.debug("Stdout forwarder encerrado: %s", exc)

    stdout_task = asyncio.create_task(forward_stdout())

    try:
        while True:
            msg = await asyncio.wait_for(websocket.receive_text(), timeout=IDLE_TIMEOUT_SECONDS)
            if proc.stdin and not proc.stdin.is_closing():
                proc.stdin.write(msg.encode("utf-8", errors="replace"))
                await proc.stdin.drain()
    except TimeoutError:
        logger.info("Terminal PID %d encerrado por inatividade.", proc.pid)
    except WebSocketDisconnect:
        logger.info("WebSocket de terminal desconectado pelo cliente.")
    except Exception as exc:
        logger.debug("Exceção na sessão do terminal: %s", exc)
    finally:
        stdout_task.cancel()
        if proc.returncode is None:
            try:
                proc.kill()
                await proc.wait()
            except Exception as exc:
                logger.debug("Falha ao encerrar processo do terminal: %s", exc)
        security_core.audit.record_event(
            operation="TERMINAL_WS_CLOSED",
            status="SUCCESS",
            user_id=principal.display_id,
            project_id=project_id,
            parameters={"pid": proc.pid},
        )
        logger.info("Processo de terminal PID %d encerrado.", proc.pid)
