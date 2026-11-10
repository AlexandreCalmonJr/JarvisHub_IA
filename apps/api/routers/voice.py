import logging
import httpx
from fastapi import APIRouter, File, HTTPException, UploadFile
from apps.api.deps import hybrid_router

logger = logging.getLogger("jarvis.api.voice")
router = APIRouter(tags=["voice"])


@router.post("/api/v1/voice/transcribe")
async def transcribe_audio_endpoint(file: UploadFile = File(...)):
    """Transcreve áudio do microfone do usuário usando Whisper (Groq/OpenAI) com alta fidelidade em português."""
    audio_bytes = await file.read()
    if not audio_bytes:
        raise HTTPException(status_code=400, detail="Arquivo de áudio vazio.")

    cfg = hybrid_router.online_config
    if cfg and cfg.api_key:
        provider = cfg.provider_name.lower()
        if provider == "groq":
            base_url = "https://api.groq.com/openai/v1"
            model = "whisper-large-v3-turbo"
        else:
            base_url = cfg.base_url or "https://api.openai.com/v1"
            model = "whisper-1"

        try:
            headers = {"Authorization": f"Bearer {cfg.api_key}"}
            filename = file.filename or "recording.webm"
            content_type = file.content_type or "audio/webm"
            files = {"file": (filename, audio_bytes, content_type)}
            data = {"model": model, "language": "pt"}

            async with httpx.AsyncClient(timeout=20.0) as client:
                res = await client.post(
                    f"{base_url.rstrip('/')}/audio/transcriptions",
                    headers=headers,
                    files=files,
                    data=data,
                )
                if res.status_code == 200:
                    transcription = res.json().get("text", "").strip()
                    logger.info("Áudio transcrito com sucesso via Whisper (%s): '%s'", model, transcription)
                    return {"text": transcription, "provider": provider, "model": model, "success": True}
                else:
                    logger.warning("Falha na API externa de transcrição (%d): %s", res.status_code, res.text)
        except Exception as exc:
            logger.warning("Exceção na chamada de transcrição externa: %s", exc)

    # Fallback local se nenhuma chave estiver configurada
    try:
        from services.voice_runtime.stt_adapter import LocalSTTAdapter
        stt = LocalSTTAdapter()
        local_res = stt.transcribe_audio_bytes(audio_bytes)
        return {"text": local_res.text, "provider": "local_fallback", "model": "local", "success": True}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Erro ao processar áudio: {exc}")
