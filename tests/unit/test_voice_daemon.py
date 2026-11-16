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
