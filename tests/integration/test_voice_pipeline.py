import io
import wave

import pytest
from httpx import ASGITransport, AsyncClient

from apps.api.main import app
from services.voice_runtime.types import SpeechSynthesisResult, TranscriptionResult


def _wav() -> bytes:
    audio = io.BytesIO()
    with wave.open(audio, "wb") as stream:
        stream.setnchannels(1)
        stream.setsampwidth(2)
        stream.setframerate(16000)
        stream.writeframes(b"\x00\x00" * 1600)
    return audio.getvalue()


@pytest.mark.asyncio
async def test_transcription_route_uses_local_adapter_when_no_cloud_key(monkeypatch):
    from apps.api.routers import voice

    monkeypatch.setattr(voice.hybrid_router, "online_config", None)
    monkeypatch.setattr(
        "services.voice_runtime.stt_adapter.LocalSTTAdapter.transcribe_audio_bytes",
        lambda _self, _audio: TranscriptionResult(text="jarvis teste local", confidence=0.9),
    )
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.post(
            "/api/v1/voice/transcribe",
            files={"file": ("voice.wav", _wav(), "audio/wav")},
        )
    assert response.status_code == 200
    assert response.json()["text"] == "jarvis teste local"
    assert response.json()["provider"] == "local"


@pytest.mark.asyncio
async def test_synthesize_route_returns_wav_bytes(monkeypatch):
    audio = _wav()
    monkeypatch.setattr(
        "services.voice_runtime.tts_adapter.LocalTTSAdapter.synthesize",
        lambda _self, _text: SpeechSynthesisResult(audio_bytes=audio, is_spoken=True),
    )
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.post("/api/v1/voice/synthesize", json={"text": "Olá"})
    assert response.status_code == 200
    assert response.headers["content-type"].startswith("audio/wav")
    assert response.content.startswith(b"RIFF")


@pytest.mark.asyncio
async def test_voice_command_is_deterministic_audited_and_never_executes_unknown_actions():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        clock = await client.post("/api/v1/voice/command", json={"text": "que horas são"})
        unknown = await client.post(
            "/api/v1/voice/command", json={"text": "apague todos os arquivos"}
        )
        approval = await client.post(
            "/api/v1/voice/command", json={"text": "aprove a transferência"}
        )

    assert clock.status_code == 200
    assert clock.json()["intent"] == "time.now"
    assert unknown.status_code == 200
    assert unknown.json()["intent"] == "command.unsupported"
    assert "Nenhuma ação foi executada" in unknown.json()["reply"]
    assert approval.json()["approval_required"] is True
    assert "painel" in approval.json()["reply"]


@pytest.mark.asyncio
async def test_voice_command_checks_project_ownership():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.post(
            "/api/v1/voice/command",
            json={"text": "que horas são", "project_id": "project-not-owned"},
        )
    assert response.status_code == 404
