from services.security_core import AuditTrail

from .stt_adapter import LocalSTTAdapter
from .tts_adapter import LocalTTSAdapter
from .types import SpeechSynthesisResult, TranscriptionResult, VoiceConfig


class VoiceEngine:
    """
    Motor de processamento de voz local do JARVIS.
    Coordena escuta via STT, despacho para Master e fala via TTS com privacidade estrita.
    """

    def __init__(
        self,
        config: VoiceConfig | None = None,
        stt_adapter: LocalSTTAdapter | None = None,
        tts_adapter: LocalTTSAdapter | None = None,
        audit_trail: AuditTrail | None = None,
    ):
        self.config = config or VoiceConfig(enabled=False)
        self.stt = stt_adapter or LocalSTTAdapter()
        self.tts = tts_adapter or LocalTTSAdapter()
        self.audit_trail = audit_trail

    def process_incoming_speech(self, audio_bytes: bytes) -> TranscriptionResult:
        if not self.config.enabled:
            return TranscriptionResult(text="", confidence=0.0)

        result = self.stt.transcribe_audio_bytes(audio_bytes)
        return result

    def speak_response(self, text: str) -> SpeechSynthesisResult:
        if not self.config.enabled:
            return SpeechSynthesisResult(is_spoken=False)

        result = self.tts.synthesize(text)
        return result
