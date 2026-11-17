import io
import wave

import numpy as np

from apps.voice_daemon.main import (
    CHUNK_SAMPLES,
    SAMPLE_RATE,
    GlobalHotkeyListener,
    VoiceDaemon,
    is_autostart_enabled,
    set_autostart,
)


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


def test_daemon_notifications_and_hotkey_flag():
    daemon = VoiceDaemon()
    assert not daemon.hotkey_wake_requested.is_set()

    # Simula evento do atalho global
    daemon._on_hotkey_pressed()
    assert daemon.hotkey_wake_requested.is_set()

    # Valida chamada de notify segura
    class MockTray:
        def __init__(self):
            self.last_msg = None

        def notify(self, msg, title=""):
            self.last_msg = msg

    daemon.tray = MockTray()
    daemon.notify("Teste de notificação")
    assert daemon.tray.last_msg == "Teste de notificação"


def test_autostart_helpers(monkeypatch):
    registry_store = {}

    class MockWinreg:
        HKEY_CURRENT_USER = "HKCU"
        KEY_READ = 1
        KEY_SET_VALUE = 2
        REG_SZ = 1

        @staticmethod
        def OpenKey(hkey, subkey, reserved, access):
            class KeyContext:
                def __enter__(self):
                    return self

                def __exit__(self, *args):
                    pass

            return KeyContext()

        @staticmethod
        def QueryValueEx(key, name):
            if name in registry_store:
                return (registry_store[name], 1)
            raise OSError("Value not found")

        @staticmethod
        def SetValueEx(key, name, reserved, type_, val):
            registry_store[name] = val

        @staticmethod
        def DeleteValue(key, name):
            registry_store.pop(name, None)

    monkeypatch.setattr("apps.voice_daemon.main.sys.platform", "win32")
    monkeypatch.setitem(globals(), "winreg", MockWinreg)
    import sys

    monkeypatch.setitem(sys.modules, "winreg", MockWinreg)

    assert is_autostart_enabled() is False
    assert set_autostart(True) is True
    assert is_autostart_enabled() is True
    assert "JARVISVoiceDaemon" in registry_store
    assert set_autostart(False) is True
    assert is_autostart_enabled() is False


def test_global_hotkey_listener_lifecycle():
    import threading
    import time

    stop_event = threading.Event()
    fired = []

    def on_press():
        fired.append(True)

    listener = GlobalHotkeyListener(callback=on_press, stop_event=stop_event)
    listener.start()
    time.sleep(0.1)
    stop_event.set()
    if listener.thread:
        listener.thread.join(timeout=2)
    assert not listener.thread.is_alive()


def test_voice_daemon_sentence_tts_and_barge_in(monkeypatch):
    from services.voice_runtime.types import SpeechSynthesisResult

    daemon = VoiceDaemon()

    synthesized_sentences = []

    def mock_synthesize(sentence: str):
        synthesized_sentences.append(sentence)
        stream = io.BytesIO()
        with wave.open(stream, "wb") as wav:
            wav.setnchannels(1)
            wav.setsampwidth(2)
            wav.setframerate(SAMPLE_RATE)
            wav.writeframes(b"\x00\x00" * 320)
        return SpeechSynthesisResult(audio_bytes=stream.getvalue(), is_spoken=True)

    monkeypatch.setattr(daemon.tts, "synthesize", mock_synthesize)

    played = []
    stopped = []

    class MockSoundDevice:
        @staticmethod
        def play(samples, framerate):
            played.append(len(samples))

        @staticmethod
        def wait():
            pass

        @staticmethod
        def stop():
            stopped.append(True)

    import sys

    monkeypatch.setitem(sys.modules, "sounddevice", MockSoundDevice)

    # 1. Normal sentence-by-sentence TTS
    daemon._say("Primeira frase. Segunda frase! Terceira frase?")
    assert len(synthesized_sentences) == 3
    assert synthesized_sentences == ["Primeira frase.", "Segunda frase!", "Terceira frase?"]
    assert len(played) == 3

    # 2. Barge-in interruption during playback
    synthesized_sentences.clear()
    played.clear()

    def interrupting_play(samples, framerate):
        played.append(len(samples))
        daemon.interrupt_speech()

    monkeypatch.setattr(MockSoundDevice, "play", staticmethod(interrupting_play))
    daemon._say("Quarta frase. Quinta frase.")
    assert len(synthesized_sentences) == 1
    assert synthesized_sentences == ["Quarta frase."]
    assert len(played) == 1
    assert len(stopped) >= 1

    # 3. Interrupt speech helper
    daemon.barge_in_event.clear()
    daemon.is_speaking.set()
    daemon._on_hotkey_pressed()
    assert daemon.barge_in_event.is_set()


def test_voice_daemon_mute_hotkey_toggle():
    daemon = VoiceDaemon()
    assert not daemon.muted.is_set()

    class MockTray:
        def __init__(self):
            self.last_msg = None

        def notify(self, msg, title=""):
            self.last_msg = msg

    daemon.tray = MockTray()
    daemon._on_mute_hotkey()
    assert daemon.muted.is_set()
    assert daemon.tray.last_msg == "Microfone mutado."

    daemon._on_mute_hotkey()
    assert not daemon.muted.is_set()
    assert daemon.tray.last_msg == "Microfone ativado."


def test_voice_daemon_handles_kill_switch(monkeypatch):
    daemon = VoiceDaemon()
    spoken = []

    def mock_say(text):
        spoken.append(text)

    monkeypatch.setattr(daemon, "_say", mock_say)
    monkeypatch.setenv("JARVIS_VOICE_TOKEN", "test-token")

    class MockTray:
        def __init__(self):
            self.last_msg = None

        def notify(self, msg, title=""):
            self.last_msg = msg

    daemon.tray = MockTray()

    class MockResponse:
        def raise_for_status(self):
            pass

        def json(self):
            return {
                "reply": "JARVIS está em modo de parada de emergência.",
                "intent": "system.killed",
                "approval_required": False,
            }

    import httpx

    def mock_post(*args, **kwargs):
        return MockResponse()

    monkeypatch.setattr(httpx, "post", mock_post)

    daemon._dispatch_command("que horas são", None)
    assert spoken == ["JARVIS está em modo de parada de emergência."]
    assert daemon.tray.last_msg == "JARVIS está em modo de parada de emergência."

