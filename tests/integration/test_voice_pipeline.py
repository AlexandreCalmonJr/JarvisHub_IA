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


@pytest.mark.asyncio
async def test_voice_command_all_10_personal_assistant_intents():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        session = "session-test-v3"

        # 1. time.now
        r1 = await client.post(
            "/api/v1/voice/command", json={"text": "que horas são", "session_id": session}
        )
        assert r1.status_code == 200
        assert r1.json()["intent"] == "time.now"

        # 2. date.today
        r2 = await client.post(
            "/api/v1/voice/command", json={"text": "qual a data de hoje", "session_id": session}
        )
        assert r2.status_code == 200
        assert r2.json()["intent"] == "date.today"

        # 3. timer.set
        r3 = await client.post(
            "/api/v1/voice/command",
            json={"text": "põe um timer de 15 minutos", "session_id": session},
        )
        assert r3.status_code == 200
        assert r3.json()["intent"] == "timer.set"
        assert "15 minutos" in r3.json()["reply"]

        # 4. reminder.create
        r4 = await client.post(
            "/api/v1/voice/command",
            json={"text": "lembra-me de enviar o relatório", "session_id": session},
        )
        assert r4.status_code == 200
        assert r4.json()["intent"] == "reminder.create"
        assert "enviar o relatório" in r4.json()["reply"]

        # 5. weather.info
        r5 = await client.post(
            "/api/v1/voice/command", json={"text": "como está o tempo", "session_id": session}
        )
        assert r5.status_code == 200
        assert r5.json()["intent"] == "weather.info"

        # 6. system.status
        r6 = await client.post(
            "/api/v1/voice/command", json={"text": "status do sistema", "session_id": session}
        )
        assert r6.status_code == 200
        assert r6.json()["intent"] == "system.status"

        # 7. calc.eval (percentage)
        r7 = await client.post(
            "/api/v1/voice/command",
            json={"text": "quanto é 15% de 240", "session_id": session},
        )
        assert r7.status_code == 200
        assert r7.json()["intent"] == "calc.eval"
        assert "36" in r7.json()["reply"]

        # 8. calc.eval (arithmetic)
        r8 = await client.post(
            "/api/v1/voice/command",
            json={"text": "quanto é 25 mais 17", "session_id": session},
        )
        assert r8.status_code == 200
        assert r8.json()["intent"] == "calc.eval"
        assert "42" in r8.json()["reply"]

        # 9. app.open
        r9 = await client.post(
            "/api/v1/voice/command", json={"text": "abre o VS Code", "session_id": session}
        )
        assert r9.status_code == 200
        assert r9.json()["intent"] == "app.open"
        assert "vs code" in r9.json()["reply"].lower()

        # 10. voice.repeat (repeats r9)
        r10 = await client.post(
            "/api/v1/voice/command", json={"text": "repete", "session_id": session}
        )
        assert r10.status_code == 200
        assert r10.json()["intent"] == "voice.repeat"
        assert r9.json()["reply"] in r10.json()["reply"]

        # 11. voice.cancel
        r11 = await client.post(
            "/api/v1/voice/command", json={"text": "cancela", "session_id": session}
        )
        assert r11.status_code == 200
        assert r11.json()["intent"] == "voice.cancel"
        assert "cancelada" in r11.json()["reply"].lower()


@pytest.mark.asyncio
async def test_voice_command_blocks_when_kill_switch_active():
    from apps.api.deps import security_core

    try:
        security_core.kill_switch.trigger_global_kill("Teste de segurança de voz")
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.post(
                "/api/v1/voice/command", json={"text": "que horas são", "session_id": "test-kill"}
            )
            assert resp.status_code == 200
            data = resp.json()
            assert data["intent"] == "system.killed"
            assert "parada de emergência" in data["reply"]
    finally:
        security_core.kill_switch.reset_global_kill(authorized_by="admin-test")


@pytest.mark.asyncio
async def test_voice_briefing_and_converse_endpoints():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        # 1. Briefing
        briefing_resp = await client.get("/api/v1/voice/briefing")
        assert briefing_resp.status_code == 200
        bdata = briefing_resp.json()
        assert bdata["assistant_name"] == "JARVIS"
        assert "greeting" in bdata
        assert "briefing_line" in bdata
        assert len(bdata["quick_prompts"]) > 0

        # 2. Converse com Wake Word apenas
        wake_resp = await client.post(
            "/api/v1/voice/converse",
            json={"transcript": "Ei JARVIS", "practice_mode": "general"},
        )
        assert wake_resp.status_code == 200
        wdata = wake_resp.json()
        assert wdata["detected_wake_word"] is True
        assert "na escuta" in wdata["reply"]

        # 3. Converse com comando determinístico
        cmd_resp = await client.post(
            "/api/v1/voice/converse",
            json={"transcript": "Ei JARVIS, que horas são?", "practice_mode": "general"},
        )
        assert cmd_resp.status_code == 200
        cdata = cmd_resp.json()
        assert cdata["detected_wake_word"] is True
        assert "Agora são" in cdata["reply"]

        # 4. Converse em modo inglês
        en_resp = await client.post(
            "/api/v1/voice/converse",
            json={"transcript": "Hello JARVIS", "practice_mode": "english"},
        )
        assert en_resp.status_code == 200
        edata = en_resp.json()
        assert "Great job" in edata["reply"]

        # 5. Converse com variação fonética PT-BR ("e João" -> "Ei JARVIS") + comando coloquial de dia/tempo
        joao_resp = await client.post(
            "/api/v1/voice/converse",
            json={"transcript": "e João como é que tá o dia hoje", "practice_mode": "general"},
        )
        assert joao_resp.status_code == 200
        jdata = joao_resp.json()
        assert jdata["detected_wake_word"] is True
        assert jdata["trigger_phrase"] == "Ei JARVIS"
        assert "dia está agradável" in jdata["reply"] or "tempo" in jdata["reply"]
        assert jdata["model_used"] == "jarvis-deterministic-intent"

        # 6. Converse apenas com a chamada fonética ("e João" sem comando subsequente)
        joao_solo_resp = await client.post(
            "/api/v1/voice/converse",
            json={"transcript": "e João", "practice_mode": "general"},
        )
        assert joao_solo_resp.status_code == 200
        jsdata = joao_solo_resp.json()
        assert jsdata["detected_wake_word"] is True
        assert "JARVIS na escuta! Diga o que precisa" in jsdata["reply"]
        assert jsdata["command_extracted"] == ""

        # 7. Saudação coloquial e identidade
        greet_resp = await client.post(
            "/api/v1/voice/converse",
            json={"transcript": "Ei JARVIS tudo bem", "practice_mode": "general"},
        )
        assert greet_resp.status_code == 200
        assert "Tudo ótimo por aqui!" in greet_resp.json()["reply"]

