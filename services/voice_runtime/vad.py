"""Voice activity helpers for mono PCM WAV recordings."""

from __future__ import annotations

import io
import math
import struct
import wave


def has_voice_activity(audio_bytes: bytes, *, rms_threshold: int = 450) -> bool:
    """Return whether a WAV contains any frame above the configured RMS threshold."""
    try:
        with wave.open(io.BytesIO(audio_bytes), "rb") as wav:
            if wav.getcomptype() != "NONE" or wav.getnchannels() not in (1, 2):
                return False
            if wav.getsampwidth() != 2:
                return False
            while frame := wav.readframes(1024):
                samples = struct.iter_unpack("<h", frame[: len(frame) - len(frame) % 2])
                values = [sample[0] for sample in samples]
                rms = (
                    math.sqrt(sum(value * value for value in values) / len(values)) if values else 0
                )
                if rms >= rms_threshold:
                    return True
    except (wave.Error, EOFError, ValueError):
        return False
    return False
