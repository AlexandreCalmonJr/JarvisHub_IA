import asyncio
import os
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
        )

        try:
            stdout_bytes, stderr_bytes = await asyncio.wait_for(
                proc.communicate(),
                timeout=timeout,
            )
        except TimeoutError:
            try:
                proc.kill()
                await proc.wait()
            except ProcessLookupError:
                pass
            duration_ms = (time.perf_counter() - start_time) * 1000.0
            raise SandboxTimeoutError(
                f"Comando '{' '.join(command)}' excedeu o tempo limite ({timeout}s)."
            )

        duration_ms = (time.perf_counter() - start_time) * 1000.0
        stdout = stdout_bytes.decode("utf-8", errors="replace")[: self.max_output_chars]
        stderr = stderr_bytes.decode("utf-8", errors="replace")[: self.max_output_chars]

        # Redige automaticamente qualquer potencial segredo na saída
        sanitized_stdout = redact_string(stdout)
        sanitized_stderr = redact_string(stderr)

        return proc.returncode or 0, sanitized_stdout, sanitized_stderr, duration_ms
