"""
JARVIS AI HUB - Native Desktop Window Shell
Executa o backend FastAPI silenciosamente e abre a janela nativa do Windows (Edge WebView2).
Permite uso por usuários finais sem abrir navegador ou terminal.
"""

import msvcrt
import os
import socket
import sys
import threading
import time
import urllib.request
from pathlib import Path

import uvicorn
import webview

# Define e fixa o diretório base de trabalho da aplicação
if getattr(sys, "frozen", False):
    ROOT_DIR = Path(sys.executable).parent
else:
    ROOT_DIR = Path(__file__).resolve().parent.parent.parent

os.chdir(str(ROOT_DIR))

if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

from apps.api.main import app


class DesktopServerThread(threading.Thread):
    def __init__(self, host: str = "127.0.0.1", port: int = 8000):
        super().__init__(daemon=True)
        self.host = host
        self.port = port
        self.config = uvicorn.Config(
            app=app,
            host=self.host,
            port=self.port,
            log_level="error",
            access_log=False,
        )
        self.server = uvicorn.Server(self.config)

    def run(self):
        try:
            self.server.run()
        except Exception as exc:
            print(f"Aviso servidor Uvicorn: {exc}")

    def stop(self):
        self.server.should_exit = True


def wait_for_server(url: str, timeout: float = 12.0) -> bool:
    start_time = time.time()
    while time.time() - start_time < timeout:
        try:
            with urllib.request.urlopen(url, timeout=1.5) as response:
                if response.status == 200:
                    return True
        except Exception:
            time.sleep(0.3)
    return False


def is_port_listening(host: str, port: int) -> bool:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.settimeout(0.5)
        return s.connect_ex((host, port)) == 0


def is_voice_daemon_running() -> bool:
    lock_path = ROOT_DIR / "data" / "run" / "voice-daemon.lock"
    if not lock_path.exists():
        return False
    try:
        with lock_path.open("a+b") as lock_file:
            lock_file.seek(0)
            try:
                msvcrt.locking(lock_file.fileno(), msvcrt.LK_NBLCK, 1)
            except OSError:
                return True
            msvcrt.locking(lock_file.fileno(), msvcrt.LK_UNLCK, 1)
            return False
    except OSError:
        return False


def launch_desktop():
    HOST = "127.0.0.1"
    PORT = 8000
    HEALTH_URL = f"http://{HOST}:{PORT}/api/v1/system/health"
    APP_URL = f"http://{HOST}:{PORT}/"

    server_thread = None
    already_running = False

    # Verifica se já existe um JARVIS Hub ativo respondendo no health check
    if is_port_listening(HOST, PORT) and wait_for_server(HEALTH_URL, timeout=1.5):
        already_running = True
        print("Backend JARVIS AI Hub detectado ativo na porta 8000. Conectando janela nativa...")
    else:
        # Inicia Uvicorn em background
        server_thread = DesktopServerThread(host=HOST, port=PORT)
        server_thread.start()

        # Aguarda o servidor responder
        if not wait_for_server(HEALTH_URL, timeout=12.0):
            print("Aviso: Tempo limite aguardando inicialização do backend local.")

    # Abre a janela nativa do Windows (Edge WebView2)
    window = webview.create_window(
        title="JARVIS AI Hub 3.0",
        url=APP_URL,
        width=1366,
        height=850,
        min_size=(1024, 700),
        background_color="#070a12",
        text_select=True,
    )

    # Inicia loop de interface gráfica nativa
    webview.start()

    # Encerra o backend ao fechar a janela se tiver sido iniciado por este processo
    if server_thread and not already_running and not is_voice_daemon_running():
        server_thread.stop()


if __name__ == "__main__":
    launch_desktop()
