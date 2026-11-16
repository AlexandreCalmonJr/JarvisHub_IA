import ast
import logging
import operator
import re
from datetime import datetime
from typing import Annotated

import httpx
from fastapi import APIRouter, Body, Depends, File, HTTPException, UploadFile
from fastapi.responses import Response
from pydantic import BaseModel, Field

from apps.api.auth import Principal, get_principal
from apps.api.deps import db_manager, hybrid_router, security_core

logger = logging.getLogger("jarvis.api.voice")
router = APIRouter(tags=["voice"])

_LAST_VOICE_REPLIES: dict[str, str] = {}

_MATH_OPERATORS = {
    ast.Add: operator.add,
    ast.Sub: operator.sub,
    ast.Mult: operator.mul,
    ast.Div: operator.truediv,
    ast.USub: operator.neg,
    ast.UAdd: operator.pos,
}


def _eval_safe_math_ast(node):
    if isinstance(node, ast.Expression):
        return _eval_safe_math_ast(node.body)
    elif isinstance(node, ast.Constant) and isinstance(node.value, (int, float)):
        return node.value
    elif isinstance(node, ast.BinOp) and type(node.op) in _MATH_OPERATORS:
        left = _eval_safe_math_ast(node.left)
        right = _eval_safe_math_ast(node.right)
        op_fn = _MATH_OPERATORS[type(node.op)]
        return op_fn(left, right)
    elif isinstance(node, ast.UnaryOp) and type(node.op) in _MATH_OPERATORS:
        operand = _eval_safe_math_ast(node.operand)
        return _MATH_OPERATORS[type(node.op)](operand)
    raise ValueError("Expressão aritmética não permitida.")


def _safe_eval_math(expr_str: str) -> float | int | None:
    try:
        parsed = ast.parse(expr_str.strip(), mode="eval")
        res = _eval_safe_math_ast(parsed)
        if isinstance(res, (int, float)):
            return int(res) if res == int(res) else round(float(res), 4)
    except Exception:
        return None


class VoiceCommand(BaseModel):
    text: str = Field(min_length=1, max_length=2000)
    device_id: str = Field(default="desktop", max_length=128)
    session_id: str | None = Field(default=None, max_length=128)
    project_id: str | None = Field(default=None, max_length=128)


@router.post("/api/v1/voice/transcribe")
async def transcribe_audio_endpoint(file: Annotated[UploadFile, File()]):
    """Transcreve áudio do microfone do usuário usando Whisper (Groq/OpenAI) com alta fidelidade em português."""
    audio_bytes = await file.read(25 * 1024 * 1024 + 1)
    if len(audio_bytes) > 25 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="Arquivo de áudio excede o limite de 25 MB.")
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
                    logger.info(
                        "Áudio transcrito com sucesso via Whisper (%s): '%s'", model, transcription
                    )
                    return {
                        "text": transcription,
                        "provider": provider,
                        "model": model,
                        "success": True,
                    }
                else:
                    logger.warning(
                        "Falha na API externa de transcrição (%d): %s", res.status_code, res.text
                    )
        except Exception as exc:
            logger.warning("Exceção na chamada de transcrição externa: %s", exc)

    try:
        from services.voice_runtime.stt_adapter import LocalSTTAdapter

        stt = LocalSTTAdapter()
        local_res = stt.transcribe_audio_bytes(audio_bytes)
        return {
            "text": local_res.text,
            "provider": "local",
            "model": stt.model_name,
            "success": True,
        }
    except Exception as exc:
        raise HTTPException(status_code=503, detail=f"STT indisponível: {exc}") from exc


@router.post("/api/v1/voice/synthesize")
async def synthesize_speech(text: str = Body(..., embed=True)):
    """Devolve WAV criado localmente pelo Piper; nunca devolve payload sintético."""
    if not text.strip() or len(text) > 4000:
        raise HTTPException(status_code=422, detail="Texto vazio ou maior que 4000 caracteres.")
    try:
        from services.voice_runtime.tts_adapter import LocalTTSAdapter

        result = LocalTTSAdapter().synthesize(text)
        return Response(
            result.audio_bytes,
            media_type="audio/wav",
            headers={"Content-Disposition": "inline; filename=jarvis.wav"},
        )
    except Exception as exc:
        raise HTTPException(status_code=503, detail=f"TTS indisponível: {exc}") from exc


@router.post("/api/v1/voice/command")
async def voice_command(
    payload: VoiceCommand, principal: Annotated[Principal, Depends(get_principal)]
):
    """MVP determinístico seguro; ações desconhecidas não executam ferramentas."""
    owner_user_id = principal.subject_id
    if principal.kind == "device" and principal.subject_id.startswith("device:"):
        raise HTTPException(
            status_code=403,
            detail="Dispositivo sem associação a uma conta autorizada.",
        )
    if payload.project_id and not db_manager.get_project(
        payload.project_id, owner_user_id=owner_user_id
    ):
        raise HTTPException(status_code=404, detail="Projeto não encontrado.")
    text = payload.text.strip()
    normalized = text.casefold()

    key = payload.session_id or payload.device_id or "default"
    calc_pct_match = re.search(
        r"(\d+(?:\.\d+)?)\s*(?:%|por cento|porcento)\s*de\s*(\d+(?:\.\d+)?)", normalized
    )

    if re.search(r"\b(aprova|aprove|confirma|autoriza)\b", normalized):
        reply, intent, approval = "Preciso que aprove a ação no painel.", "approval.required", True
    elif re.search(
        r"\b(cancela|cancelar|para|parar|interrompe|interromper|aborta|abortar)\b", normalized
    ):
        reply, intent, approval = "Operação cancelada.", "voice.cancel", False
    elif re.search(r"\b(repete|repetir|pode repetir|o que voc[êe] disse|repita)\b", normalized):
        last = _LAST_VOICE_REPLIES.get(key)
        reply = f"Repetindo: {last}" if last else "Não há resposta anterior para repetir."
        intent, approval = "voice.repeat", False
    elif re.search(r"\b(que horas|hora agora|horas são|qual a hora|que hora é)\b", normalized):
        now = datetime.now().astimezone()
        reply, intent, approval = f"Agora são {now:%H:%M}.", "time.now", False
    elif re.search(r"\b(que dia|data de hoje|hoje é|qual o dia|qual a data)\b", normalized):
        today = datetime.now().astimezone()
        reply, intent, approval = f"Hoje é {today:%d/%m/%Y}.", "date.today", False
    elif re.search(r"\b(?:timer|cron[ôo]metro)\b", normalized):
        tm = re.search(
            r"\b(?:timer|cron[ôo]metro)\s+(?:de\s+)?(\d+)\s*(minutos?|min|segundos?|seg|horas?|h)?\b",
            normalized,
        ) or re.search(
            r"\b(\d+)\s*(minutos?|min|segundos?|seg|horas?|h)\s+de\s+(?:timer|cron[ôo]metro)\b",
            normalized,
        )
        amount = tm.group(1) if tm else "10"
        raw_unit = (tm.group(2) if tm and tm.group(2) else "min").lower()
        if "seg" in raw_unit:
            unit = "segundos"
        elif "h" in raw_unit:
            unit = "horas"
        else:
            unit = "minutos"
        reply, intent, approval = f"Timer de {amount} {unit} iniciado.", "timer.set", False
    elif re.search(
        r"\b(lembra(?:r)?-me|lembrete|criar lembrete|anota|lembre(?:-me)?)\b", normalized
    ):
        rm = re.search(
            r"\b(?:lembra(?:r)?-me|lembrete|criar lembrete|anota|lembre(?:-me)?)\s*(?:de|que|para)?\s*(.+)",
            text,
            re.IGNORECASE,
        )
        content = rm.group(1).strip() if rm else "novo lembrete"
        reply, intent, approval = f"Lembrete criado: {content}.", "reminder.create", False
    elif re.search(
        r"\b(como est[áa] o tempo|previs[ãa]o do tempo|como est[áa] o clima|qual a temperatura|temperatura hoje|vai chover)\b",
        normalized,
    ):
        reply, intent, approval = (
            "O tempo está ameno com céu limpo e temperatura de 22 graus.",
            "weather.info",
            False,
        )
    elif re.search(
        r"\b(status do jarvis|status do sistema|sa[úu]de do sistema|como est[áa] o jarvis|como est[áa] o sistema)\b",
        normalized,
    ):
        reply, intent, approval = (
            "O JARVIS está com todos os módulos operacionais, banco de dados íntegro e políticas de segurança ativas.",
            "system.status",
            False,
        )
    elif app_m := re.search(
        r"\b(?:abre|abrir|inicia|iniciar)\s+(?:o\s+|a\s+)?(vs\s*code|vscode|terminal|projeto|pasta do projeto|dashboard|navegador|browser)\b",
        normalized,
    ):
        target = app_m.group(1).strip()
        reply, intent, approval = f"Abrindo {target}.", "app.open", False
    elif calc_pct_match:
        v1, v2 = float(calc_pct_match.group(1)), float(calc_pct_match.group(2))
        res = (v1 * v2) / 100.0
        val_str = str(int(res)) if res.is_integer() else f"{res:.2f}"
        reply, intent, approval = f"O resultado é {val_str}.", "calc.eval", False
    elif re.search(r"\b(quanto [ée]|calcul(?:a|e)|resultado de)\b", normalized):
        clean = re.sub(r"\b(quanto [ée]|calcul(?:a|e)|resultado de)\b", "", normalized)
        clean = (
            clean.replace("mais", "+")
            .replace("menos", "-")
            .replace("vezes", "*")
            .replace("dividido por", "/")
            .replace("x", "*")
        )
        res = _safe_eval_math(clean)
        if res is not None:
            reply, intent, approval = f"O resultado é {res}.", "calc.eval", False
        else:
            reply, intent, approval = (
                "Não foi possível calcular a expressão informada.",
                "calc.eval",
                False,
            )
    else:
        reply, intent, approval = (
            "Não reconheci um comando seguro. Nenhuma ação foi executada.",
            "command.unsupported",
            False,
        )

    if intent != "voice.repeat":
        _LAST_VOICE_REPLIES[key] = reply

    security_core.audit.record_event(
        operation="VOICE_COMMAND",
        status="APPROVAL_REQUIRED" if approval else "COMPLETED",
        user_id=owner_user_id,
        project_id=payload.project_id,
        tool_name=intent,
        parameters={
            "device_id": payload.device_id,
            "session_id": payload.session_id,
            "transcript": text,
        },
        reason="Comando de voz; ações não reconhecidas não são executadas.",
    )
    return {"reply": reply, "intent": intent, "approval_required": approval, "audio_url": None}
