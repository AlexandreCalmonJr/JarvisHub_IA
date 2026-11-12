import io
import wave

import numpy as np

from apps.voice_daemon.main import CHUNK_SAMPLES, SAMPLE_RATE, VoiceDaemon


class FakeRawInputStream:
    def __init__(self):
        self.chunks = [
            np.full(CHUNK_SAMPLES, 2_000, dtype=np.int16).tobytes(),
            *[np.zeros(CHUNK_SAMPLES, dtype=np.int16).tobytes() for _ in range(20)],
        ]

    def read(self, _frames):
        return self.chunks.pop(0), False


def test_daemon_builds_wav_from_raw_microphone_bytes(monkeypatch):
    monkeypatch.setenv("JARVIS_VAD_RMS", "600")
    daemon = VoiceDaemon()
    audio = daemon._record_utterance(FakeRawInputStream())

    assert audio
    with wave.open(io.BytesIO(audio), "rb") as wav:
        assert wav.getnchannels() == 1
        assert wav.getsampwidth() == 2
        assert wav.getframerate() == SAMPLE_RATE
        assert wav.getnframes() == CHUNK_SAMPLES * 13
