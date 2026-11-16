import pytest

from services.observability.vision_engine import VisionEngine


def test_vision_engine_extracts_metadata():
    engine = VisionEngine()

    # PNG fake header
    png_bytes = (
        b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR"
        + (100).to_bytes(4, "big")
        + (50).to_bytes(4, "big")
        + b"\x08\x06\x00\x00\x00"
    )
    meta_png = engine.extract_image_metadata(png_bytes)
    assert meta_png["mime_type"] == "image/png"
    assert meta_png["width"] == 100
    assert meta_png["height"] == 50
    assert meta_png["aspect_ratio"] == 2.0

    # JPEG fake header
    jpg_bytes = b"\xff\xd8\xff\xe0" + b"\x00" * 30
    meta_jpg = engine.extract_image_metadata(jpg_bytes)
    assert meta_jpg["mime_type"] == "image/jpeg"

    # WebP fake header
    webp_bytes = b"RIFF" + (40).to_bytes(4, "little") + b"WEBPVP8 " + b"\x00" * 20
    meta_webp = engine.extract_image_metadata(webp_bytes)
    assert meta_webp["mime_type"] == "image/webp"


@pytest.mark.asyncio
async def test_vision_engine_local_heuristic_fallback():
    engine = VisionEngine(hybrid_router=None)
    dummy_bytes = (
        b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR"
        + (200).to_bytes(4, "big")
        + (150).to_bytes(4, "big")
        + b"\x08\x06\x00\x00\x00"
    )

    result = await engine.analyze_image(dummy_bytes, prompt="Descreva a cena", task_type="objects")
    assert result["success"] is True
    assert result["provider"] == "local_vision_engine"
    assert "200x150" in result["description"]
    assert "camera_frame" in result["detected_objects"]
