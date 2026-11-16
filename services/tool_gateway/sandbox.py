import asyncio
import logging
import os
import signal
import time
from pathlib import Path

from services.security_core.redaction import redact_string

logger = logging.getLogger(__name__)


class SandboxTimeoutError(Exception):
    pass


class SubprocessSandbox:
    """
    Executor isolado para processos de teste, lint e análise.
    Garante sanitização de variáveis de ambiente, timeout rigoroso e encerramento de subprocessos órfãos.
    """

    def __init__(self, default_timeout_seconds: float = 60.0, max_output_chars: int = 250_000):
        self.default_timeout_seconds = default_timeout_seconds
        self.max_output_chars = max_output_chars

    def _sanitize_env(self) -> dict[str, str]:
        """Remove segredos e credenciais das variáveis de ambiente do subprocesso."""
        safe_env = {}
        forbidden_keywords = ("secret", "key", "token", "password", "auth", "cred")
        for k, v in os.environ.items():
            if not any(kw in k.lower() for kw in forbidden_keywords):
                safe_env[k] = v
        # Força variáveis de ambiente previsíveis
        safe_env["PYTHONUNBUFFERED"] = "1"
        safe_env["CI"] = "true"
        return safe_env

    @staticmethod
    async def _terminate_tree(proc: asyncio.subprocess.Process) -> None:
        """Termina o processo e descendentes antes de libertar a tarefa."""
        try:
            if os.name == "nt":
                killer = await asyncio.create_subprocess_exec(
                    "taskkill",
                    "/PID",
                    str(proc.pid),
                    "/T",
                    "/F",
                    stdout=asyncio.subprocess.DEVNULL,
                    stderr=asyncio.subprocess.DEVNULL,
                )
                await asyncio.wait_for(killer.wait(), timeout=3)
            else:
                os.killpg(os.getpgid(proc.pid), signal.SIGKILL)
        except (OSError, ProcessLookupError, TimeoutError):
            try:
                proc.kill()
            except ProcessLookupError:
                pass
        try:
            await asyncio.wait_for(proc.wait(), timeout=3)
        except TimeoutError:
            try:
                proc.kill()
            except ProcessLookupError:
                pass
            await proc.wait()

    async def run_command(
        self,
        command: list[str],
        cwd: Path,
        timeout_seconds: float | None = None,
    ) -> tuple[int, str, str, float]:
        timeout = timeout_seconds or self.default_timeout_seconds
        start_time = time.perf_counter()

        proc = await asyncio.create_subprocess_exec(
            *command,
            cwd=str(cwd),
            env=self._sanitize_env(),
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
            start_new_session=(os.name != "nt"),
        )

        try:
            stdout_bytes, stderr_bytes = await asyncio.wait_for(
                proc.communicate(),
                timeout=timeout,
            )
        except TimeoutError:
            await self._terminate_tree(proc)
            duration_ms = (time.perf_counter() - start_time) * 1000.0
            raise SandboxTimeoutError(
                f"Comando '{' '.join(command)}' excedeu o tempo limite ({timeout}s)."
            )
        except asyncio.CancelledError:
            await self._terminate_tree(proc)
            raise

        duration_ms = (time.perf_counter() - start_time) * 1000.0
        stdout = stdout_bytes.decode("utf-8", errors="replace")[: self.max_output_chars]
        stderr = stderr_bytes.decode("utf-8", errors="replace")[: self.max_output_chars]

        # Redige automaticamente qualquer potencial segredo na saída
        sanitized_stdout = redact_string(stdout)
        sanitized_stderr = redact_string(stderr)

        return proc.returncode or 0, sanitized_stdout, sanitized_stderr, duration_ms

    async def run_shell_command(
        self,
        command: str,
        cwd: Path,
        timeout_seconds: float | None = None,
    ) -> tuple[int, str, str, float]:
        """Executa um comando de shell completo, confinado ao diretório de trabalho.

        Usado pelo agente de código para testes, build e comandos git. A política
        de bloqueio de comandos destrutivos é aplicada antes, na camada de
        ferramentas; aqui garantimos ambiente sanitizado, timeout e redação.
        """
        timeout = timeout_seconds or self.default_timeout_seconds
        start_time = time.perf_counter()

        proc = await asyncio.create_subprocess_shell(
            command,
            cwd=str(cwd),
            env=self._sanitize_env(),
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
            start_new_session=(os.name != "nt"),
        )

        try:
            stdout_bytes, stderr_bytes = await asyncio.wait_for(
                proc.communicate(),
                timeout=timeout,
            )
        except TimeoutError:
            await self._terminate_tree(proc)
            duration_ms = (time.perf_counter() - start_time) * 1000.0
            raise SandboxTimeoutError(f"Comando excedeu o tempo limite ({timeout}s).")
        except asyncio.CancelledError:
            await self._terminate_tree(proc)
            raise

        duration_ms = (time.perf_counter() - start_time) * 1000.0
        stdout = stdout_bytes.decode("utf-8", errors="replace")[: self.max_output_chars]
        stderr = stderr_bytes.decode("utf-8", errors="replace")[: self.max_output_chars]
        return (
            proc.returncode or 0,
            redact_string(stdout),
            redact_string(stderr),
            duration_ms,
        )


class ContainerSandbox(SubprocessSandbox):
    """Executor isolado em contentor Docker/Podman para execução de ferramentas com alto nível de confinamento (SIM-08).

    Aplica limites estritos de memória, CPU, isolamento de rede (--network=none) e sistema de arquivos
    restrito ao volume montado. Caso o daemon de contentores não esteja ativo, efetua fallback seguro
    para SubprocessSandbox.
    """

    def __init__(
        self,
        default_timeout_seconds: float = 60.0,
        max_output_chars: int = 250_000,
        image: str = "python:3.12-slim",
        memory_limit: str = "512m",
        cpus: float = 1.0,
        network: str = "none",
        enable_fallback: bool = True,
    ):
        super().__init__(
            default_timeout_seconds=default_timeout_seconds,
            max_output_chars=max_output_chars,
        )
        self.image = image
        self.memory_limit = memory_limit
        self.cpus = cpus
        self.network = network
        self.enable_fallback = enable_fallback
        self._container_cli: str | None = None
        self._available: bool | None = None

    async def is_available(self) -> bool:
        """Verifica se Docker ou Podman estão disponíveis e com daemon operacional."""
        if self._available is not None:
            return self._available

        if os.getenv("JARVIS_SANDBOX_DRIVER", "").lower() == "subprocess":
            self._available = False
            return False

        for cli in ("docker", "podman"):
            try:
                proc = await asyncio.create_subprocess_exec(
                    cli,
                    "info",
                    stdout=asyncio.subprocess.DEVNULL,
                    stderr=asyncio.subprocess.DEVNULL,
                )
                code = await asyncio.wait_for(proc.wait(), timeout=3.0)
                if code == 0:
                    self._container_cli = cli
                    self._available = True
                    return True
            except Exception as exc:
                logger.debug("CLI de contentor '%s' não respondeu ao comando info: %s", cli, exc)
                continue

        self._available = False
        return False

    def build_container_args(self, command: list[str], cwd: Path) -> list[str]:
        """Constrói os argumentos para o docker run com confinamento total."""
        cli = self._container_cli or "docker"
        abs_cwd = str(cwd.resolve()).replace("\\", "/")
        return [
            cli,
            "run",
            "--rm",
            "-i",
            f"--network={self.network}",
            f"--memory={self.memory_limit}",
            f"--cpus={self.cpus}",
            "-v",
            f"{abs_cwd}:/workspace:rw",
            "-w",
            "/workspace",
            self.image,
            *command,
        ]

    async def run_command(
        self,
        command: list[str],
        cwd: Path,
        timeout_seconds: float | None = None,
    ) -> tuple[int, str, str, float]:
        if await self.is_available():
            container_cmd = self.build_container_args(command, cwd)
            return await super().run_command(
                container_cmd, cwd=cwd, timeout_seconds=timeout_seconds
            )

        if not self.enable_fallback:
            raise RuntimeError(
                "Contentor Docker/Podman indisponível e fallback para subprocesso está desativado."
            )

        return await super().run_command(command, cwd=cwd, timeout_seconds=timeout_seconds)

    async def run_shell_command(
        self,
        command: str,
        cwd: Path,
        timeout_seconds: float | None = None,
    ) -> tuple[int, str, str, float]:
        if await self.is_available():
            container_cmd = self.build_container_args(["sh", "-c", command], cwd)
            return await super().run_command(
                container_cmd, cwd=cwd, timeout_seconds=timeout_seconds
            )

        if not self.enable_fallback:
            raise RuntimeError(
                "Contentor Docker/Podman indisponível e fallback para subprocesso está desativado."
            )

        return await super().run_shell_command(command, cwd=cwd, timeout_seconds=timeout_seconds)
