import base64

import pytest
from httpx import ASGITransport, AsyncClient

from apps.api.main import app


@pytest.mark.asyncio
async def test_vision_endpoint_analyzes_frame():
    png_bytes = (
        b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR"
        + (640).to_bytes(4, "big")
        + (480).to_bytes(4, "big")
        + b"\x08\x06\x00\x00\x00"
    )
    b64_str = base64.b64encode(png_bytes).decode("ascii")

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.post(
            "/api/v1/vision/analyze",
            json={
                "image_base64": f"data:image/png;base64,{b64_str}",
                "prompt": "Detecte pessoas e objetos",
                "task_type": "objects",
                "device_id": "openbot-test",
            },
        )
    assert response.status_code == 200
    data = response.json()
    assert data["success"] is True
    assert "metadata" in data
    assert data["metadata"]["width"] == 640
    assert data["metadata"]["height"] == 480


@pytest.mark.asyncio
async def test_vision_endpoint_rejects_empty_or_invalid_base64():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.post(
            "/api/v1/vision/analyze",
            json={
                "image_base64": "invalid_base64!@@#$%",
                "prompt": "teste",
            },
        )
    assert response.status_code == 400
