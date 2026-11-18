"""Testes unitários para isolamento de teammates via Git Worktrees."""

from unittest.mock import MagicMock, patch

from services.autonomous_agent.teammate_manager import TeammateManager


def test_teammate_worktree_spawn_and_terminate():
    manager = TeammateManager()

    with patch("subprocess.run") as mock_run:
        # Mock git worktree add
        mock_run.return_value = MagicMock(returncode=0, stderr="")

        teammate = manager.spawn_teammate(
            name="Refactoring Bot",
            role="refactorer",
            project_id="jarvis-core",
            isolate_worktree=True,
        )

        assert teammate.isolated_workspace is True
        assert teammate.worktree_path is not None
        assert f"teammate/{teammate.id}" == teammate.worktree_branch
        assert mock_run.call_count >= 1

        # Dispatch
        dispatch_res = manager.dispatch_task(teammate.id, "Refatorar imports")
        assert dispatch_res["status"] == "failed"
        assert dispatch_res["reason"] == "teammate_execution_unsupported"
        assert dispatch_res["isolated_workspace"] is True

        # Terminate
        terminated = manager.terminate_teammate(teammate.id)
        assert terminated is True
        assert manager.get_teammate(teammate.id) is None


def test_teammate_shared_workspace():
    manager = TeammateManager()

    with patch("subprocess.run") as mock_run:
        teammate = manager.spawn_teammate(
            name="Doc Bot",
            role="writer",
            isolate_worktree=False,
        )

        assert teammate.isolated_workspace is False
        assert teammate.worktree_path is None
        mock_run.assert_not_called()
