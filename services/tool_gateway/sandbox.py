import asyncio
import os
import signal
import time
from pathlib import Path

from services.security_core.redaction import redact_string


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
