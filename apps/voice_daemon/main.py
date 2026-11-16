"""Ouvinte opcional de wake word para desktop. Requer o extra `.[voice]`."""

from __future__ import annotations

import io
import logging
import os
import subprocess
import sys
import threading
import time
import wave
from pathlib import Path

import httpx

from services.voice_runtime.stt_adapter import LocalSTTAdapter
from services.voice_runtime.tts_adapter import LocalTTSAdapter

ROOT = Path(__file__).resolve().parents[2]
DATA_DIR = ROOT / "data"
LOG_DIR = DATA_DIR / "logs"
LOCK_PATH = DATA_DIR / "run" / "voice-daemon.lock"
API_BASE = os.getenv("JARVIS_VOICE_API", "http://127.0.0.1:8000").rstrip("/")
SAMPLE_RATE = 16_000
CHUNK_SAMPLES = 1_280
logger = logging.getLogger("jarvis.voice_daemon")


def is_autostart_enabled() -> bool:
    """Verifica se o daemon de voz está configurado para iniciar com o Windows."""
    if sys.platform != "win32":
        return False
    try:
        import winreg

        with winreg.OpenKey(
            winreg.HKEY_CURRENT_USER,
            r"Software\Microsoft\Windows\CurrentVersion\Run",
            0,
            winreg.KEY_READ,
        ) as key:
            winreg.QueryValueEx(key, "JARVISVoiceDaemon")
            return True
    except OSError:
        return False


def set_autostart(enabled: bool) -> bool:
    """Ativa ou desativa a inicialização automática no Registro do Windows (HKCU Run)."""
    if sys.platform != "win32":
        return False
    try:
        import winreg

        with winreg.OpenKey(
            winreg.HKEY_CURRENT_USER,
            r"Software\Microsoft\Windows\CurrentVersion\Run",
            0,
            winreg.KEY_SET_VALUE,
        ) as key:
            if enabled:
                pythonw = Path(sys.executable).parent / "pythonw.exe"
                exe = str(pythonw) if pythonw.exists() else sys.executable
                cmd = f'"{exe}" -m apps.voice_daemon.main'
                winreg.SetValueEx(key, "JARVISVoiceDaemon", 0, winreg.REG_SZ, cmd)
            else:
                try:
                    winreg.DeleteValue(key, "JARVISVoiceDaemon")
                except FileNotFoundError:
                    pass
        return True
    except Exception as exc:
        logger.warning("Falha ao configurar autostart: %s", exc)
        return False


class GlobalHotkeyListener:
    """Escuta o atalho global Ctrl+Shift+J em segundo plano no Windows."""

    def __init__(self, callback, stop_event: threading.Event) -> None:
        self.callback = callback
        self.stop_event = stop_event
        self.thread: threading.Thread | None = None

    def start(self) -> None:
        if sys.platform != "win32":
            return
        self.thread = threading.Thread(target=self._run, name="jarvis-global-hotkey", daemon=True)
        self.thread.start()

    def _run(self) -> None:
        import ctypes
        from ctypes import wintypes

        user32 = ctypes.windll.user32
        hotkey_id = 101
        mod_control = 0x0002
        mod_shift = 0x0004
        vk_j = 0x4A

        if not user32.RegisterHotKey(None, hotkey_id, mod_control | mod_shift, vk_j):
            logger.warning("Não foi possível registrar o atalho global Ctrl+Shift+J (pode estar em uso).")
            return

        logger.info("Atalho global Ctrl+Shift+J registrado com sucesso.")
        try:
            msg = wintypes.MSG()
            while not self.stop_event.is_set():
                has_msg = user32.PeekMessageW(ctypes.byref(msg), None, 0, 0, 1)  # PM_REMOVE = 1
                if has_msg and msg.message == 0x0312 and msg.wParam == hotkey_id:
                    try:
                        self.callback()
                    except Exception:
                        logger.exception("Erro ao processar ativação por atalho global.")
                time.sleep(0.05)
        finally:
            user32.UnregisterHotKey(None, hotkey_id)


class VoiceDaemon:
    def __init__(self) -> None:
        self.stop_event = threading.Event()
        self.muted = threading.Event()
        self.hotkey_wake_requested = threading.Event()
        self.tray = None
        self.stt = LocalSTTAdapter(os.getenv("JARVIS_STT_MODEL", "base"))
        self.tts = LocalTTSAdapter()
        self.backend: subprocess.Popen | None = None
        self._lock_file = None
        self.hotkey_listener: GlobalHotkeyListener | None = None

    def acquire_single_instance(self) -> None:
        LOCK_PATH.parent.mkdir(parents=True, exist_ok=True)
        self._lock_file = LOCK_PATH.open("a+b")
        self._lock_file.seek(0)
        try:
            import msvcrt

            msvcrt.locking(self._lock_file.fileno(), msvcrt.LK_NBLCK, 1)
        except OSError as exc:
            raise RuntimeError("O assistente de voz já está em execução.") from exc

    def release_single_instance(self) -> None:
        if self._lock_file:
            try:
                import msvcrt

                self._lock_file.seek(0)
                msvcrt.locking(self._lock_file.fileno(), msvcrt.LK_UNLCK, 1)
            except OSError:
                pass
            self._lock_file.close()

    def _ensure_backend(self) -> None:
        try:
            response = httpx.get(f"{API_BASE}/api/v1/system/health", timeout=1.5)
            if response.is_success:
                return
        except httpx.HTTPError:
            pass
        python = sys.executable
        self.backend = subprocess.Popen(
            [python, "-m", "uvicorn", "apps.api.main:app", "--host", "127.0.0.1", "--port", "8000"],
            cwd=ROOT,
            stdin=subprocess.DEVNULL,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
        )
        deadline = time.monotonic() + 30
        while time.monotonic() < deadline and not self.stop_event.is_set():
            if self.backend.poll() is not None:
                raise RuntimeError("O backend JARVIS terminou durante a inicialização.")
            try:
                response = httpx.get(f"{API_BASE}/api/v1/system/health", timeout=1)
                if response.is_success:
                    return
            except httpx.HTTPError:
                time.sleep(0.5)
        raise RuntimeError("Tempo limite aguardando o backend JARVIS.")

    @staticmethod
    def _icon_image(muted: bool = False):
        from PIL import Image, ImageDraw

        image = Image.new("RGB", (64, 64), (18, 24, 39))
        draw = ImageDraw.Draw(image)
        draw.ellipse((8, 8, 56, 56), fill=(185, 48, 58) if muted else (37, 133, 94))
        draw.text((22, 20), "J", fill="white", stroke_width=1)
        return image

    def _set_muted(self, _icon=None, _item=None) -> None:
        if self.muted.is_set():
            self.muted.clear()
        else:
            self.muted.set()
        if self.tray:
            self.tray.icon = self._icon_image(self.muted.is_set())
            self.tray.title = (
                "JARVIS — microfone mutado" if self.muted.is_set() else "JARVIS — ouvindo Jarvis"
            )

    def _quit(self, _icon=None, _item=None) -> None:
        self.stop_event.set()
        if self.tray:
            self.tray.stop()

    def _say(self, text: str) -> None:
        import numpy as np
        import sounddevice as sd

        result = self.tts.synthesize(text)
        with wave.open(io.BytesIO(result.audio_bytes), "rb") as wav:
            samples = np.frombuffer(wav.readframes(wav.getnframes()), dtype=np.int16)
            sd.play(samples, wav.getframerate(), blocking=True)

    @staticmethod
    def _wav(pcm) -> bytes:
        import numpy as np

        output = io.BytesIO()
        with wave.open(output, "wb") as wav:
            wav.setnchannels(1)
            wav.setsampwidth(2)
            wav.setframerate(SAMPLE_RATE)
            wav.writeframes(pcm.astype(np.int16, copy=False).tobytes())
        return output.getvalue()

    def _record_utterance(self, stream) -> bytes | None:
        import numpy as np

        chunks: list[np.ndarray] = []
        voiced = False
        silent_chunks = 0
        max_chunks = int(12 * SAMPLE_RATE / CHUNK_SAMPLES)
        for _ in range(max_chunks):
            if self.stop_event.is_set() or self.muted.is_set():
                return None
            chunk, overflowed = stream.read(CHUNK_SAMPLES)
            if overflowed:
                logger.warning("Overflow na captura do microfone; áudio descartado.")
                return None
            pcm = np.frombuffer(chunk, dtype=np.int16)
            chunks.append(pcm.copy())
            rms = float(np.sqrt(np.mean(pcm.astype(np.float32) ** 2)))
            if rms >= int(os.getenv("JARVIS_VAD_RMS", "600")):
                voiced = True
                silent_chunks = 0
            elif voiced:
                silent_chunks += 1
                if silent_chunks >= int(1.0 * SAMPLE_RATE / CHUNK_SAMPLES):
                    break
        if not voiced:
            return None
        return self._wav(np.concatenate(chunks))

    def notify(self, message: str, title: str = "JARVIS") -> None:
        """Emite notificação visual na bandeja do sistema."""
        if self.tray and hasattr(self.tray, "notify"):
            try:
                self.tray.notify(message, title=title)
            except Exception as exc:
                logger.debug("Falha na notificação de bandeja: %s", exc)

    def _toggle_autostart(self, _icon=None, _item=None) -> None:
        """Alterna a inicialização automática com o Windows no Registro."""
        current = is_autostart_enabled()
        new_state = not current
        set_autostart(new_state)
        msg = (
            "Inicialização automática ativada."
            if new_state
            else "Inicialização automática desativada."
        )
        self.notify(msg, title="JARVIS")

    def _on_hotkey_pressed(self) -> None:
        """Callback acionado pelo atalho global Ctrl+Shift+J."""
        logger.info("Ativação via atalho global Ctrl+Shift+J.")
        self.hotkey_wake_requested.set()
        self.notify("Atalho global acionado. Ouvindo...", title="JARVIS")

    def _dispatch_command(self, transcript: str, stream) -> None:
        """Encaminha o comando transcrito para a API local e vocaliza a resposta."""
        token = os.getenv("JARVIS_VOICE_TOKEN", "").strip()
        if not token:
            self._say("Configure o token de voz para continuar.")
            logger.error("JARVIS_VOICE_TOKEN ausente; transcrição descartada.")
            return
        try:
            headers = {"Authorization": f"Bearer {token}"}
            command_response = httpx.post(
                f"{API_BASE}/api/v1/voice/command",
                headers=headers,
                json={"text": transcript, "device_id": "desktop-voice-daemon"},
                timeout=15,
            )
            command_response.raise_for_status()
            command = command_response.json()
            if command.get("intent") != "command.unsupported":
                reply = command.get("reply", "Não consegui processar o pedido.")
            else:
                session_file = DATA_DIR / "voice-session-id.txt"
                session_id = (
                    session_file.read_text(encoding="utf-8").strip()
                    if session_file.exists()
                    else ""
                )
                if not session_id:
                    session_id = f"voice-{os.urandom(8).hex()}"
                    session_file.write_text(session_id, encoding="utf-8")
                response = httpx.post(
                    f"{API_BASE}/api/v1/chat",
                    headers=headers,
                    json={"prompt": transcript, "session_id": session_id, "engine": "auto"},
                    timeout=240,
                )
                response.raise_for_status()
                result = response.json()
                if result.get("approval_required"):
                    reply = "Preciso que aprove a ação no painel."
                    self.notify("Ação requer aprovação no painel do JARVIS.", title="JARVIS Approval")
                else:
                    reply = result.get("final_summary") or result.get("response") or "Concluído."
            self._say(str(reply)[:1200])

            # Follow-up: janela de 6 segundos para continuidade sem nova wake word
            time.sleep(0.3)
            self._check_follow_up(stream)
        except httpx.HTTPError:
            logger.exception("Falha ao chamar o comando de voz local.")
            self._say("Não consegui contactar o JARVIS.")

    def _check_follow_up(self, stream) -> None:
        """Janela de escuta ativa (6s) após uma resposta para conversas encadeadas."""
        import numpy as np

        chunks: list[np.ndarray] = []
        voiced = False
        silent_chunks = 0
        followup_limit = int(6.0 * SAMPLE_RATE / CHUNK_SAMPLES)
        for _ in range(followup_limit):
            if self.stop_event.is_set() or self.muted.is_set() or self.hotkey_wake_requested.is_set():
                return
            chunk, overflowed = stream.read(CHUNK_SAMPLES)
            if overflowed or not chunk:
                continue
            pcm = np.frombuffer(chunk, dtype=np.int16)
            rms = float(np.sqrt(np.mean(pcm.astype(np.float32) ** 2)))
            if rms >= int(os.getenv("JARVIS_VAD_RMS", "600")):
                voiced = True
                chunks.append(pcm.copy())
                silent_chunks = 0
            elif voiced:
                chunks.append(pcm.copy())
                silent_chunks += 1
                if silent_chunks >= int(1.0 * SAMPLE_RATE / CHUNK_SAMPLES):
                    break

        if voiced and chunks:
            logger.info("Fala identificada na janela de follow-up.")
            audio = self._wav(np.concatenate(chunks))
            transcript = self.stt.transcribe_audio_bytes(audio).text.strip()
            if transcript:
                self._dispatch_command(transcript, stream)

    def _handle_wake(self, stream) -> None:
        self.notify("Ouvindo pergunta...", title="JARVIS Voice")
        self._say("Sim?")
        time.sleep(0.25)
        audio = self._record_utterance(stream)
        if not audio:
            return
        transcript = self.stt.transcribe_audio_bytes(audio).text.strip()
        if not transcript:
            return
        self._dispatch_command(transcript, stream)

    def _listen(self) -> None:
        import numpy as np
        import sounddevice as sd
        from openwakeword.model import Model

        model_name = os.getenv("JARVIS_WAKEWORD_MODEL", "hey_jarvis")
        model = Model(wakeword_models=[model_name])
        threshold = float(os.getenv("JARVIS_WAKEWORD_THRESHOLD", "0.5"))
        with sd.RawInputStream(
            samplerate=SAMPLE_RATE,
            blocksize=CHUNK_SAMPLES,
            channels=1,
            dtype="int16",
        ) as stream:
            logger.info("Wake word ativo; o áudio permanece no dispositivo até transcrição local.")
            while not self.stop_event.is_set():
                if self.muted.is_set():
                    time.sleep(0.2)
                    continue

                # Ativação via atalho global (Ctrl+Shift+J)
                if self.hotkey_wake_requested.is_set():
                    self.hotkey_wake_requested.clear()
                    try:
                        self._handle_wake(stream)
                    except Exception:
                        logger.exception("Falha no ciclo acionado por atalho.")
                    continue

                chunk, overflowed = stream.read(CHUNK_SAMPLES)
                if overflowed:
                    logger.warning("Overflow na entrada do microfone.")
                    continue
                predictions = model.predict(
                    np.frombuffer(chunk, dtype=np.int16),
                    patience={model_name: 2},
                    threshold={model_name: threshold},
                    debounce_time=2.0,
                )
                if predictions and max(predictions.values()) >= threshold:
                    model.reset()
                    try:
                        self._handle_wake(stream)
                    except Exception:
                        logger.exception("Falha no ciclo de voz; retomando escuta.")
                    model.reset()

    def _listen_guarded(self) -> None:
        try:
            self._listen()
        except Exception:
            logger.exception("O microfone ou o modelo wake word falhou.")
            self.stop_event.set()
            if self.tray:
                self.tray.stop()

    def run(self) -> None:
        LOG_DIR.mkdir(parents=True, exist_ok=True)
        logging.basicConfig(
            filename=LOG_DIR / "voice.log",
            level=logging.INFO,
            format="%(asctime)s %(levelname)s %(message)s",
        )
        if not os.getenv("JARVIS_VOICE_TOKEN", "").strip():
            raise RuntimeError("Defina JARVIS_VOICE_TOKEN antes de iniciar o assistente.")
        import pystray

        self.acquire_single_instance()
        listener = None
        try:
            self._ensure_backend()

            # Inicia escuta do atalho global Ctrl+Shift+J no Windows
            self.hotkey_listener = GlobalHotkeyListener(
                callback=self._on_hotkey_pressed, stop_event=self.stop_event
            )
            self.hotkey_listener.start()

            self.tray = pystray.Icon(
                "jarvis-voice",
                self._icon_image(),
                "JARVIS — ouvindo Jarvis",
                menu=pystray.Menu(
                    pystray.MenuItem("Mutar / ativar microfone", self._set_muted),
                    pystray.MenuItem(
                        "Iniciar com o Windows",
                        self._toggle_autostart,
                        checked=lambda item: is_autostart_enabled(),
                    ),
                    pystray.MenuItem("Atalho: Ctrl+Shift+J", None, enabled=False),
                    pystray.MenuItem("Sair", self._quit),
                ),
            )
            listener = threading.Thread(
                target=self._listen_guarded, name="jarvis-voice-listener", daemon=True
            )
            listener.start()
            self.tray.run()
        finally:
            self.stop_event.set()
            if self.hotkey_listener and self.hotkey_listener.thread:
                self.hotkey_listener.thread.join(timeout=2)
            if listener:
                listener.join(timeout=5)
            if self.backend and self.backend.poll() is None:
                self.backend.terminate()
                try:
                    self.backend.wait(timeout=5)
                except subprocess.TimeoutExpired:
                    self.backend.kill()
            self.release_single_instance()


def main() -> int:
    try:
        VoiceDaemon().run()
    except Exception:
        logging.basicConfig(level=logging.ERROR)
        logger.exception("O assistente de voz não pôde iniciar.")
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
