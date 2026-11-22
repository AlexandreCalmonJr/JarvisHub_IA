import asyncio
from contextlib import suppress
from datetime import datetime, timezone
import logging
import os
import time
from typing import Any

from fastapi import APIRouter, Request, Response, WebSocket, WebSocketDisconnect
from fastapi.responses import JSONResponse
import httpx
import websockets

from apps.api.deps import generate_recommendations, scan_hardware

logger = logging.getLogger("jarvis.api.brain_proxy")

router = APIRouter(tags=["second_brain_proxy"])

BRAIN_HTTP_URL = os.environ.get("JARVIS_BRAIN_URL", "http://127.0.0.1:3001").rstrip("/")
BRAIN_WS_URL = os.environ.get("JARVIS_BRAIN_WS_URL", "ws://127.0.0.1:3001/ws")

_HOP_BY_HOP_HEADERS = {
    "host",
    "content-length",
    "connection",
    "keep-alive",
    "proxy-authenticate",
    "proxy-authorization",
    "te",
    "trailers",
    "transfer-encoding",
    "upgrade",
}

_last_brain_probe_time: float = 0.0
_brain_is_online: bool = False


async def check_brain_connectivity(force: bool = False) -> bool:
    global _last_brain_probe_time, _brain_is_online
    now = time.monotonic()
    if not force and (now - _last_brain_probe_time < 3.0):
        return _brain_is_online

    _last_brain_probe_time = now
    try:
        async with httpx.AsyncClient(timeout=httpx.Timeout(0.6, connect=0.3)) as probe:
            res = await probe.get(f"{BRAIN_HTTP_URL}/api/v1/system/health/details")
            _brain_is_online = res.status_code < 500
    except Exception:
        _brain_is_online = False
    return _brain_is_online


def _get_fallback_payload(path: str) -> dict[str, Any]:
    norm = path.lower()
    if "spreadsheets" in norm:
        return {"presets": [], "items": []}
    if "media/assets" in norm or norm.endswith("/media"):
        return {"assets": [], "jobs": []}
    if "devices" in norm:
        return {"devices": []}
    if "brain/info" in norm:
        return {"status": "offline", "version": "3.0.1", "service": "jarvis-second-brain"}
    if "brain/profiles" in norm:
        return {"profiles": [], "active_profile_id": "default"}
    if "brain/schema" in norm:
        return {"tables": []}
    if "brain/memories" in norm:
        return {"memories": []}
    if "companion/state" in norm:
        return {"state": "idle", "active_device": None}
    if "push/config" in norm:
        return {"enabled": False}
    if "ide/workspace" in norm:
        return {"files": [], "root": ""}
    if "workflows" in norm:
        return {"workflows": [], "runs": []}
    if "github/history" in norm:
        return {"history": []}
    if "office/state" in norm:
        return {"sessions": [], "active": None}
    if "apps" in norm:
        return {"apps": []}
    if "models/hardware" in norm:
        try:
            specs = scan_hardware()
            recs = generate_recommendations(specs)
            return {
                "profiles": [
                    {
                        "id": "host-profile",
                        "label": specs.get("cpu_brand", "Host Hardware"),
                        "ram_gb": specs.get("ram_total_gb", 16),
                        "is_active": True,
                    }
                ],
                "active_profile_id": "host-profile",
                "providers": {
                    "ollama_connected": True,
                    "gemini_connected": False,
                    "huggingface_connected": False,
                },
                "recommendations": recs,
            }
        except Exception:
            return {"profiles": [], "active_profile_id": "default", "recommendations": []}
    return {"status": "offline", "items": []}


async def _proxy_request(request: Request) -> Response:
    global _brain_is_online
    path = request.url.path

    # Se o Second Brain já foi identificado como offline recentemente, responde imediatamente
    online = await check_brain_connectivity()
    if not online:
        if request.method in ("GET", "HEAD"):
            return JSONResponse(content=_get_fallback_payload(path), status_code=200)
        return JSONResponse(
            content={"detail": "Second Brain server (porta 3001) indisponível."},
            status_code=503,
        )

    query = request.url.query
    target_url = f"{BRAIN_HTTP_URL}{path}"
    if query:
        target_url = f"{target_url}?{query}"

    headers = {k: v for k, v in request.headers.items() if k.lower() not in _HOP_BY_HOP_HEADERS}

    body = await request.body()
    try:
        async with httpx.AsyncClient(timeout=httpx.Timeout(60.0, connect=2.0)) as client:
            resp = await client.request(
                method=request.method,
                url=target_url,
                headers=headers,
                content=body if body else None,
            )
            resp_headers = {
                k: v
                for k, v in resp.headers.items()
                if k.lower() not in ("content-length", "content-encoding", "transfer-encoding")
            }
            return Response(
                content=resp.content,
                status_code=resp.status_code,
                headers=resp_headers,
                media_type=resp.headers.get("content-type"),
            )
    except (httpx.ConnectError, httpx.ConnectTimeout, httpx.NetworkError):
        _brain_is_online = False
        logger.debug("Second Brain server (porta 3001) caiu durante %s %s", request.method, path)
        if request.method in ("GET", "HEAD"):
            return JSONResponse(content=_get_fallback_payload(path), status_code=200)
        return JSONResponse(
            content={"detail": "Second Brain server (porta 3001) indisponível."},
            status_code=503,
        )


# Roteamento transparente de todos os domínios do Second Brain Server
PROXY_ROUTES = [
    "/api/v1/spreadsheets",
    "/api/v1/spreadsheets/{path:path}",
    "/api/v1/media",
    "/api/v1/media/{path:path}",
    "/api/v1/devices",
    "/api/v1/devices/{path:path}",
    "/api/v1/android-app",
    "/api/v1/android-app/{path:path}",
    "/api/v1/app-builder",
    "/api/v1/app-builder/{path:path}",
    "/api/v1/apps",
    "/api/v1/apps/{path:path}",
    "/api/v1/brain",
    "/api/v1/brain/{path:path}",
    "/api/v1/companion",
    "/api/v1/companion/{path:path}",
    "/api/v1/push",
    "/api/v1/push/{path:path}",
    "/api/v1/ide",
    "/api/v1/ide/{path:path}",
    "/api/v1/workflows",
    "/api/v1/workflows/{path:path}",
    "/api/v1/github",
    "/api/v1/github/{path:path}",
    "/api/v1/office",
    "/api/v1/office/{path:path}",
    "/api/v1/integrations",
    "/api/v1/integrations/{path:path}",
    "/api/v1/models/hardware",
]

for route_path in PROXY_ROUTES:
    router.add_api_route(
        route_path,
        _proxy_request,
        methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS", "HEAD"],
        include_in_schema=False,
    )


@router.websocket("/ws")
async def realtime_ws_proxy(websocket: WebSocket):
    await websocket.accept()
    upstream_ws = None
    try:
        upstream_ws = await asyncio.wait_for(
            websockets.connect(BRAIN_WS_URL),
            timeout=1.0,
        )
    except Exception:
        # Quando o Second Brain está offline, confirma conexão para que o cliente não retente indefinidamente
        try:
            await websocket.send_json(
                {
                    "type": "connected",
                    "payload": {"status": "ready", "upstream": "offline"},
                    "timestamp": datetime.now(timezone.utc).isoformat(),
                }
            )
            while True:
                msg = await websocket.receive_text()
                if msg == "ping":
                    await websocket.send_text("pong")
        except WebSocketDisconnect:
            pass
        return

    async def client_to_upstream():
        try:
            while True:
                msg = await websocket.receive_text()
                await upstream_ws.send(msg)
        except (WebSocketDisconnect, Exception):
            pass

    async def upstream_to_client():
        try:
            async for msg in upstream_ws:
                await websocket.send_text(msg)
        except Exception:
            pass

    try:
        done, pending = await asyncio.wait(
            [
                asyncio.create_task(client_to_upstream()),
                asyncio.create_task(upstream_to_client()),
            ],
            return_when=asyncio.FIRST_COMPLETED,
        )
        for task in pending:
            task.cancel()
    finally:
        with suppress(Exception):
            await upstream_ws.close()
