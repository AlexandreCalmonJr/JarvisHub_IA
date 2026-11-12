import os
import tempfile
import time
from pathlib import Path

from .types import TranscriptionResult


class LocalSTTAdapter:
    """
    Adaptador local para Speech-To-Text (Whisper Local / Offline).
    Transcreve áudio localmente sem qualquer envio de dados para servidores externos.
    """

    def __init__(self, model_name: str = "base"):
        self.model_name = model_name
        self._model = None

    def transcribe_audio_bytes(self, audio_data: bytes) -> TranscriptionResult:
        if not audio_data:
            return TranscriptionResult(text="", duration_seconds=0.0, confidence=0.0)

        start = time.perf_counter()
        try:
            from faster_whisper import WhisperModel
        except ImportError as exc:
            raise RuntimeError("STT local indisponível; instale o extra opcional 'voice'.") from exc

        if self._model is None:
            self._model = WhisperModel(
                os.getenv("JARVIS_STT_MODEL", self.model_name),
                device=os.getenv("JARVIS_STT_DEVICE", "cpu"),
                compute_type=os.getenv("JARVIS_STT_COMPUTE_TYPE", "int8"),
                download_root=os.getenv("JARVIS_MODEL_DIR") or None,
            )
        suffix = ".wav"
        with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as audio_file:
            audio_file.write(audio_data)
            audio_path = Path(audio_file.name)
        try:
            segments, info = self._model.transcribe(str(audio_path), language="pt", vad_filter=True)
            segments = list(segments)
            text = " ".join(segment.text.strip() for segment in segments).strip()
            confidence = (
                max(0.0, min(1.0, 1.0 - (sum(s.no_speech_prob for s in segments) / len(segments))))
                if segments
                else 0.0
            )
            language = info.language or "pt"
        finally:
            audio_path.unlink(missing_ok=True)
        duration = round(time.perf_counter() - start, 4)

        return TranscriptionResult(
            text=text,
            duration_seconds=duration,
            language=language,
            confidence=confidence,
        )
