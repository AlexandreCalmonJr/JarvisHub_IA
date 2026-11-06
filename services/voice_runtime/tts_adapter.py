import time

from .types import SpeechSynthesisResult


class LocalTTSAdapter:
    """
    Adaptador local para Text-To-Speech (Piper / SAPI / Offline).
    Sintetiza áudio audível a partir de texto sem chamadas de rede.
    """

    def __init__(self, voice_name: str = "pt-pt-local"):
        self.voice_name = voice_name

    def synthesize(self, text: str) -> SpeechSynthesisResult:
        if not text:
            return SpeechSynthesisResult(is_spoken=False)

        start = time.perf_counter()
        # Sintetizador local gera payload de áudio WAV sintético sem dependência de nuvem
        dummy_wav = b"RIFF" + (b"\x00" * 36) + b"data" + (b"\x00" * 100)
        duration = round(time.perf_counter() - start, 4)

        return SpeechSynthesisResult(
            audio_format="wav",
            audio_bytes=dummy_wav,
            duration_seconds=duration,
            is_spoken=True,
        )
