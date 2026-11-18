"""
Autonomous Test-Fix-Verify Loop for JARVIS AI HUB.
Executes goal-driven coding loops: Edits code -> Runs test suite -> Detects traceback ->
Adjusts code -> Re-runs, until exit code 0 or rollback on failure (inspired by Claude Code & Devin).
"""

from __future__ import annotations

import asyncio
import logging
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from services.events.event_bus import get_event_bus

logger = logging.getLogger("jarvis.coding_agent.autonomous_loop")


@dataclass
class LoopResult:
    success: bool
    iterations_run: int
    test_command: str
    final_output: str
    message: str
    rolled_back: bool = False
    modified_files: list[str] = field(default_factory=list)


class AutonomousTestFixLoop:
    """
    Executes an autonomous closed loop to solve bugs verified by test suites.
    """

    def __init__(
        self,
        working_dir: Path,
        test_command: str,
        max_iterations: int = 5,
        timeout_per_test_seconds: int = 60,
    ):
        self.working_dir = working_dir.resolve()
        self.test_command = test_command
        self.max_iterations = max_iterations
        self.timeout = timeout_per_test_seconds
        self.event_bus = get_event_bus()

    async def run(
        self,
        agent_runtime: Any,
        session_id: str,
        project_id: str,
        user_goal: str,
    ) -> LoopResult:
        """
        Runs the closed loop until tests pass or max iterations reached.
        """
        logger.info(f"Starting AutonomousTestFixLoop for command: '{self.test_command}'")
        await self.event_bus.publish(
            "coding.test_loop.started",
            {
                "command": self.test_command,
                "max_iterations": self.max_iterations,
                "goal": user_goal,
            },
            source="coding_agent",
        )

        # Baseline execution
        code, out = await self._run_command(self.test_command)
        if code == 0:
            msg = "Os testes especificados já estão passando com sucesso (exit code 0)."
            await self.event_bus.publish(
                "coding.test_loop.passed", {"iteration": 0, "output": out}, source="coding_agent"
            )
            return LoopResult(
                success=True,
                iterations_run=0,
                test_command=self.test_command,
                final_output=out,
                message=msg,
            )

        current_traceback = self._extract_traceback(out)

        for iteration in range(1, self.max_iterations + 1):
            logger.info(f"Test-Fix-Verify Loop: Iteration {iteration}/{self.max_iterations}")
            await self.event_bus.publish(
                "coding.test_loop.iteration",
                {"iteration": iteration, "traceback_preview": current_traceback[:300]},
                source="coding_agent",
            )

            prompt = (
                f"OBJETIVO: {user_goal}\n\n"
                f"O comando de teste '{self.test_command}' falhou (Iteração {iteration}/{self.max_iterations}).\n"
                f"Diagnóstico / Traceback:\n```\n{current_traceback}\n```\n\n"
                f"INSTRUÇÃO: Use as ferramentas necessárias (read_file, edit_file) para encontrar a causa "
                f"e aplicar a correção cirúrgica. Não adicione testes falsos."
            )

            # Run agent turn
            try:
                if hasattr(agent_runtime, "run_turn_sync"):
                    await agent_runtime.run_turn_sync(
                        session_id=session_id,
                        project_id=project_id,
                        user_prompt=prompt,
                    )
                elif hasattr(agent_runtime, "run"):
                    # Stream or coroutine
                    async for _ in agent_runtime.run(
                        session_id=session_id, project_id=project_id, user_prompt=prompt
                    ):
                        pass
            except Exception as e:
                logger.exception("Error during agent turn in test loop")

            # Re-execute tests
            code, out = await self._run_command(self.test_command)
            if code == 0:
                msg = f"Correção concluída e validada com sucesso na iteração {iteration} (exit code 0)!"
                logger.info(msg)
                await self.event_bus.publish(
                    "coding.test_loop.passed",
                    {"iteration": iteration, "output": out},
                    source="coding_agent",
                )
                return LoopResult(
                    success=True,
                    iterations_run=iteration,
                    test_command=self.test_command,
                    final_output=out,
                    message=msg,
                )

            current_traceback = self._extract_traceback(out)

        # Max iterations reached without exit code 0 -> Trigger Rollback
        logger.warning(
            f"Test loop failed to reach exit code 0 after {self.max_iterations} iterations. Triggering rollback."
        )
        rolled_back = await self.rollback_git()

        msg = (
            f"O agente não conseguiu resolver todas as falhas de teste após {self.max_iterations} iterações. "
            f"O repositório foi revertido ao estado anterior por segurança."
            if rolled_back
            else f"Falha após {self.max_iterations} iterações."
        )

        await self.event_bus.publish(
            "coding.test_loop.failed",
            {"iterations": self.max_iterations, "rolled_back": rolled_back},
            source="coding_agent",
        )

        return LoopResult(
            success=False,
            iterations_run=self.max_iterations,
            test_command=self.test_command,
            final_output=out,
            message=msg,
            rolled_back=rolled_back,
        )

    async def _run_command(self, cmd: str) -> tuple[int, str]:
        """Runs test command asynchronously."""
        try:
            proc = await asyncio.create_subprocess_shell(
                cmd,
                cwd=str(self.working_dir),
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.STDOUT,
            )
            stdout_bytes, _ = await asyncio.wait_for(proc.communicate(), timeout=self.timeout)
            out = stdout_bytes.decode("utf-8", errors="replace")
            return (proc.returncode or 0), out
        except TimeoutError:
            return -1, f"Timeout ({self.timeout}s) ao executar: {cmd}"
        except Exception as e:
            return -1, f"Erro ao executar comando: {e}"

    def _extract_traceback(self, output: str, max_lines: int = 50) -> str:
        """Extracts the most relevant failure lines from stdout/stderr."""
        lines = output.strip().splitlines()
        if len(lines) <= max_lines:
            return output
        # Return tail of output where pytest/npm summaries are located
        return "\n".join(lines[-max_lines:])

    async def rollback_git(self) -> bool:
        """Rolls back uncommitted changes in working directory."""
        try:
            proc = await asyncio.create_subprocess_shell(
                "git checkout -- .",
                cwd=str(self.working_dir),
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )
            await proc.communicate()
            return proc.returncode == 0
        except Exception as e:
            logger.error(f"Git rollback failed: {e}")
            return False


async def execute_test_fix_loop(
    working_dir: Path,
    test_command: str,
    user_goal: str,
    agent_runtime: Any,
    session_id: str,
    project_id: str,
    max_iterations: int = 5,
) -> LoopResult:
    """Helper to instantiate and run AutonomousTestFixLoop."""
    loop = AutonomousTestFixLoop(
        working_dir=working_dir,
        test_command=test_command,
        max_iterations=max_iterations,
    )
    return await loop.run(
        agent_runtime=agent_runtime,
        session_id=session_id,
        project_id=project_id,
        user_goal=user_goal,
    )
