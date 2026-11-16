"""Router de Terminal PTY Interativo via WebSocket (estilo Cursor / Devin / Cloud9).

Permite comunicação bidirecional em tempo real com um subprocesso interativo
(PowerShell no Windows / bash no Unix) conectado ao frontend via WebSocket.
"""

from __future__ import annotations

import asyncio
import logging
import os
import sys
from pathlib import Path

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

logger = logging.getLogger("jarvis.api.terminal")
router = APIRouter(prefix="/api/v1/terminal", tags=["terminal"])


@router.websocket("/ws")
async def terminal_websocket_endpoint(
    websocket: WebSocket,
    project_id: str | None = None,
):
    """Sessão de terminal interativo conectada bidirecionalmente ao WebSocket."""
    await websocket.accept()

    # Determina o diretório de execução inicial
    work_dir = Path.cwd()
    if project_id:
        from apps.api.deps import workspace_service

        try:
            work_dir = workspace_service.get_project_dir(project_id).resolve()
        except Exception as exc:
            logger.debug("Não foi possível obter diretório do projeto %s: %s", project_id, exc)

    # Escolhe a shell padrão da plataforma
    if sys.platform == "win32":
        shell_cmd = "powershell.exe -NoLogo"
    else:
        shell_cmd = os.environ.get("SHELL", "/bin/bash")

    try:
        proc = await asyncio.create_subprocess_shell(
            shell_cmd,
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

    logger.info("Terminal interativo PTY iniciado (PID %d) em %s", proc.pid, work_dir)

    async def forward_stdout():
        try:
            while True:
                if proc.stdout is None:
                    break
                chunk = await proc.stdout.read(1024)
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
            msg = await websocket.receive_text()
            if proc.stdin and not proc.stdin.is_closing():
                proc.stdin.write(msg.encode("utf-8", errors="replace"))
                await proc.stdin.drain()
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
        logger.info("Processo de terminal PID %d encerrado.", proc.pid)
