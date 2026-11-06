from pydantic import BaseModel


class VoiceConfig(BaseModel):
    enabled: bool = False
    stt_model: str = "whisper-base-local"
    tts_voice: str = "pt-pt-local"
    push_to_talk: bool = True
    listen_timeout_seconds: float = 10.0


class TranscriptionResult(BaseModel):
    text: str
    duration_seconds: float = 0.0
    language: str = "pt"
    confidence: float = 1.0


class SpeechSynthesisResult(BaseModel):
    audio_format: str = "wav"
    audio_bytes: bytes = b""
    duration_seconds: float = 0.0
    is_spoken: bool = True
