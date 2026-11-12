import os
import shutil
import subprocess
import tempfile
import time
import wave
from pathlib import Path

from .types import SpeechSynthesisResult


class LocalTTSAdapter:
    """
    Adaptador local para Text-To-Speech (Piper / SAPI / Offline).
    Sintetiza áudio audível a partir de texto sem chamadas de rede.
    """

    def __init__(self, voice_name: str = "pt_PT-tugao-medium"):
        self.voice_name = voice_name

    def synthesize(self, text: str) -> SpeechSynthesisResult:
        if not text:
            return SpeechSynthesisResult(is_spoken=False)

        start = time.perf_counter()
        piper = os.getenv("JARVIS_PIPER_EXECUTABLE") or shutil.which("piper")
        model = os.getenv("JARVIS_PIPER_MODEL")
        if not piper or not model or not Path(model).is_file():
            raise RuntimeError(
                "TTS local indisponível; configure JARVIS_PIPER_EXECUTABLE e JARVIS_PIPER_MODEL."
            )
        with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as wav_file:
            wav_path = Path(wav_file.name)
        try:
            proc = subprocess.run(
                [piper, "--model", model, "--output_file", str(wav_path)],
                input=text.encode("utf-8"),
                capture_output=True,
                timeout=45,
                check=False,
            )
            if proc.returncode != 0 or not wav_path.is_file():
                raise RuntimeError("Piper não conseguiu sintetizar o áudio.")
            with wave.open(str(wav_path), "rb") as stream:
                if stream.getnframes() <= 0:
                    raise RuntimeError("Piper devolveu um WAV vazio.")
            audio_bytes = wav_path.read_bytes()
        finally:
            wav_path.unlink(missing_ok=True)
        duration = round(time.perf_counter() - start, 4)

        return SpeechSynthesisResult(
            audio_format="wav",
            audio_bytes=audio_bytes,
            duration_seconds=duration,
            is_spoken=True,
        )
