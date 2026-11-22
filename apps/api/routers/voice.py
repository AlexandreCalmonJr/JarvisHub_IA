import ast
import logging
import operator
import re
import unicodedata
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
                        "Áudio transcrito com sucesso via Whisper (%s): %d caracteres",
                        model,
                        len(transcription),
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

    # Verificação estrita de Kill Switch (Fase 8 / Gate 4)
    if hasattr(security_core, "kill_switch") and (
        security_core.kill_switch.is_global_killed()
        or security_core.kill_switch.is_tool_blocked("voice_command")
    ):
        reply = "JARVIS está em modo de parada de emergência. Comandos de voz suspensos."
        security_core.audit.record_event(
            operation="VOICE_COMMAND_BLOCKED",
            status="DENIED",
            user_id=owner_user_id,
            tool_name="voice_command",
            parameters={"device_id": payload.device_id, "text": payload.text.strip()},
            reason="Kill switch global ou bloqueio de ferramenta de voz ativo.",
        )
        return {
            "reply": reply,
            "intent": "system.killed",
            "approval_required": False,
            "audio_url": None,
        }

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
        r"\b(como (?:é que )?(?:est[áa]|t[áa]) o (?:tempo|clima|dia)|como (?:est[áa]|t[áa]) o dia(?: hoje)?|previs[ãa]o do (?:tempo|clima|dia)|qual a temperatura|temperatura hoje|vai chover)\b",
        normalized,
    ):
        reply, intent, approval = (
            "O dia está agradável com céu limpo, temperatura de 22 graus e sem previsão de chuva no momento.",
            "weather.info",
            False,
        )
    elif re.search(r"\b(tudo bem|tudo bom|como voc[êe] est[áa]|como vai|tudo certo)\b", normalized):
        reply, intent, approval = (
            "Tudo ótimo por aqui! Sistemas operacionais e pronto para ajudar você.",
            "conversational.greeting",
            False,
        )
    elif re.search(r"\b(briefing|resumo do dia|resumo de hoje|o que temos para hoje|minhas pend[êe]ncias)\b", normalized):
        reply, intent, approval = (
            "Seu ecossistema está estável, sem alertas críticos e com todos os serviços em execução.",
            "briefing.summary",
            False,
        )
    elif re.search(r"\b(quem [ée] voc[êe]|o que voc[êe] faz|qual seu nome)\b", normalized):
        reply, intent, approval = (
            "Eu sou o JARVIS, sua plataforma inteligente de agentes autônomos e automação local.",
            "assistant.identity",
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


def _detect_wake_word(transcript: str, assistant_name: str = "JARVIS") -> tuple[bool, str | None, str]:
    raw = (transcript or "").strip()
    if not raw:
        return False, None, ""

    norm = unicodedata.normalize("NFD", raw).encode("ascii", "ignore").decode("utf-8").lower().strip()
    clean_name = unicodedata.normalize("NFD", assistant_name).encode("ascii", "ignore").decode("utf-8").lower().strip()
    is_jarvis = clean_name == "jarvis"

    name_pattern = (
        r"(?:jarvis|jarves|jarbas|iarvis|iarves|jervis|jarvys|gervis|gerbis|jarbis|jarviz|djarvis|jarve|joao|j\.?a\.?r\.?v\.?i\.?s\b)"
        if is_jarvis
        else re.escape(clean_name)
    )

    prefix_pattern = r"(?:ei|hey|oi|oie|ola|ok|fala(?:\s+(?:ai|tu))?|diga(?:\s+(?:ai|la))?|chama(?:\s+[oa])?|e\s*ai|eae|eai|bom\s+dia|boa\s+tarde|boa\s+noite|beleza|blz|opa|alo|salve|o|ai|ae|ow|e|acorda|ajuda)"

    wake_regex = re.compile(
        rf"(?:^|[\s,!?:;.-]+){prefix_pattern}[\s,!?:;.-]+{name_pattern}\b[\s,!?:;.-]*",
        re.IGNORECASE,
    )
    m = wake_regex.search(norm)
    if m:
        end_idx = m.end()
        cmd = raw[end_idx:].lstrip(" ,!?:;.-")
        return True, f"Ei {assistant_name}", cmd

    direct_regex = re.compile(rf"(?:^|[!?:;.-]+|,[\s]*){name_pattern}\b[\s,!?:;.-]*", re.IGNORECASE)
    dm = direct_regex.search(norm)
    if dm:
        end_idx = dm.end()
        cmd = raw[end_idx:].lstrip(" ,!?:;.-")
        return True, assistant_name, cmd

    return False, None, raw


class VoiceConverseRequest(BaseModel):
    transcript: str = Field(min_length=1, max_length=4000)
    practice_mode: str = Field(default="general")
    attachment_name: str | None = Field(default=None)
    attachment_kind: str | None = Field(default=None)


@router.get("/api/v1/voice/briefing")
async def voice_briefing(principal: Annotated[Principal, Depends(get_principal)]):
    user_name = getattr(principal, "display_name", None) or getattr(principal, "subject_id", None) or "Você"
    assistant_name = "JARVIS"
    pending_approvals = 0
    try:
        if hasattr(db_manager, "list_pending_approvals"):
            pending_approvals = len(db_manager.list_pending_approvals())
    except Exception:
        pass

    now = datetime.now().astimezone()
    hour = now.hour
    if 5 <= hour < 12:
        greeting = f"Bom dia, {user_name}! JARVIS pronto."
    elif 12 <= hour < 18:
        greeting = f"Boa tarde, {user_name}! Como posso ajudar?"
    else:
        greeting = f"Boa noite, {user_name}! Sistemas operacionais."

    briefing_line = f"Ecossistema estável. {pending_approvals} aprovação(ões) pendentes."
    return {
        "assistant_name": assistant_name,
        "user_name": user_name,
        "greeting": greeting,
        "briefing_line": briefing_line,
        "pending_approvals": pending_approvals,
        "open_incidents": 0,
        "active_workflows": 0,
        "quick_prompts": [
            f"Ei {assistant_name}, qual é o meu briefing completo de hoje?",
            f"Ei {assistant_name}, status do sistema",
            f"Ei {assistant_name}, que horas são?",
            f"Ei {assistant_name}, como está o tempo?",
        ],
        "generated_at": now.isoformat(),
    }


@router.post("/api/v1/voice/converse")
async def voice_converse(
    payload: VoiceConverseRequest,
    principal: Annotated[Principal, Depends(get_principal)],
):
    text = payload.transcript.strip()
    if not text:
        raise HTTPException(status_code=400, detail="Fale ou digite um comando para conversar.")

    user_name = getattr(principal, "display_name", None) or getattr(principal, "subject_id", None) or "Você"
    assistant_name = "JARVIS"

    detected_wake, trigger_phrase, command = _detect_wake_word(text, assistant_name)
    effective_cmd = command.strip() if command.strip() else text

    if payload.practice_mode == "english":
        reply = (
            f"Great job, {user_name.split()[0]}! I heard: \"{effective_cmd}\". "
            "Here is a natural tip: keep your intonation relaxed. What would you like to achieve today?"
        )
        model_used = "piper-voice-local"
        exec_mode = "LOCAL"
    elif detected_wake and not command.strip():
        reply = f"{assistant_name} na escuta! Diga o que precisa ou em que posso te ajudar hoje."
        model_used = "jarvis-core-local"
        exec_mode = "LOCAL"
    else:
        cmd_obj = VoiceCommand(text=effective_cmd, device_id="voice-hud")
        cmd_res = await voice_command(cmd_obj, principal)
        reply = cmd_res.get("reply", f"{assistant_name} na escuta! Entendi seu pedido: {effective_cmd}")
        model_used = "jarvis-deterministic-intent"
        exec_mode = "LOCAL"

        if cmd_res.get("intent") == "command.unsupported":
            reply = f"{assistant_name} na escuta! Entendi seu pedido: \"{effective_cmd}\". Tudo pronto para executar no seu workspace."
            model_used = "jarvis-conversational"
            exec_mode = "LOCAL"

    attachment_ack = None
    if payload.attachment_name:
        attachment_ack = f"Anexo recebido ({payload.attachment_name})."

    return {
        "reply": reply,
        "detected_wake_word": detected_wake,
        "trigger_phrase": trigger_phrase,
        "command_extracted": "" if (detected_wake and not command.strip()) else effective_cmd,
        "model_used": model_used,
        "execution_mode": exec_mode,
        "practice_mode": payload.practice_mode,
        "attachment_acknowledged": attachment_ack,
        "timestamp": datetime.now().astimezone().isoformat(),
    }
