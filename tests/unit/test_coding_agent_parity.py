"""
Unit tests for Coding Agent Parity features:
- Repo Map AST generation and token budgeting
- Tolerant Unified Diff & Search/Replace Engine
- Autonomous Test-Fix-Verify Loop mechanics
"""

import pytest

from services.coding_agent.autonomous_loop import AutonomousTestFixLoop
from services.coding_agent.repo_map import RepoMapGenerator
from services.coding_agent.unified_diff import TolerantDiffPatcher


def test_repo_map_python_ast_extraction(tmp_path):
    sample_file = tmp_path / "calculator.py"
    sample_file.write_text(
        """
class Calculator:
    \"\"\"Calculadora simples para teste de AST.\"\"\"
    def __init__(self, precision: int = 2):
        self.precision = precision

    def add(self, a: float, b: float) -> float:
        return a + b

def standalone_helper(x: int) -> bool:
    return x > 0
""",
        encoding="utf-8",
    )

    generator = RepoMapGenerator(cache_dir=tmp_path / ".cache")
    repo_map = generator.generate(tmp_path, max_tokens=500)

    assert "calculator.py:" in repo_map
    assert "class Calculator" in repo_map
    assert "def add(a: float, b: float) -> float" in repo_map
    assert "def standalone_helper(x: int) -> bool" in repo_map
    # Check length is well within token budget (500 tokens * 4 = 2000 chars)
    assert len(repo_map) <= 2000


def test_repo_map_typescript_extraction(tmp_path):
    ts_file = tmp_path / "userService.ts"
    ts_file.write_text(
        """
export interface User {
    id: string;
    name: string;
}

export class UserService {
    async getUser(id: string) {
        return { id, name: "Test" };
    }
}

export async function fetchAllUsers(): Promise<User[]> {
    return [];
}
""",
        encoding="utf-8",
    )

    generator = RepoMapGenerator(cache_dir=tmp_path / ".cache")
    repo_map = generator.generate(tmp_path, max_tokens=500)

    assert "userService.ts:" in repo_map
    assert "interface User" in repo_map
    assert "class UserService" in repo_map
    assert "def fetchAllUsers()" in repo_map


def test_tolerant_diff_exact_match():
    original = "line 1\nold code block\nline 3\n"
    search = "old code block"
    replace = "new polished code block"

    result = TolerantDiffPatcher.apply_search_replace(original, search, replace)
    assert result.success is True
    assert result.hunks_applied == 1
    assert "new polished code block" in result.modified_content
    assert "old code block" not in result.modified_content
    assert "--- a/file" in result.unified_diff
    assert "+++ b/file" in result.unified_diff


def test_tolerant_diff_whitespace_fuzzy_match():
    original = "def example():\n    x = 1\n    y = 2\n    return x + y\n"
    # Search block has different leading whitespace / tab shifts
    search = "x = 1\n  y = 2"
    replace = "x = 10\n    y = 20"

    result = TolerantDiffPatcher.apply_search_replace(original, search, replace, fuzzy=True)
    assert result.success is True
    assert result.hunks_applied == 1
    assert "x = 10" in result.modified_content


def test_tolerant_diff_ambiguous_block():
    original = "item\nitem\n"
    search = "item"
    replace = "new_item"

    result = TolerantDiffPatcher.apply_search_replace(original, search, replace)
    assert result.success is False
    assert result.hunks_failed == 1
    assert "Ambiguidade" in result.error_message


@pytest.mark.asyncio
async def test_autonomous_loop_baseline_pass(tmp_path):
    loop = AutonomousTestFixLoop(
        working_dir=tmp_path,
        test_command="echo 'ALL_TESTS_PASSED'",
        max_iterations=3,
    )

    class DummyRuntime:
        pass

    outcome = await loop.run(
        agent_runtime=DummyRuntime(),
        session_id="test-session",
        project_id="test-proj",
        user_goal="Make tests pass",
    )

    assert outcome.success is True
    assert outcome.iterations_run == 0
    assert "já estão passando" in outcome.message
