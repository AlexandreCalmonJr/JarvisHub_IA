import asyncio

import pytest

from services.quality_studio.test_runner import QualityStudioService


class WorkspaceStub:
    def __init__(self, project_dir):
        self.project_dir = project_dir

    def get_project_dir(self, project_id):
        assert project_id == "project-a"
        return self.project_dir


def test_discovery_skips_test_files_outside_project_via_symlink(tmp_path):
    project_dir = tmp_path / "project-a"
    project_dir.mkdir()
    outside = tmp_path / "other_project"
    outside.mkdir()
    external_test = outside / "test_private.py"
    external_test.write_text("def test_private(): pass", encoding="utf-8")
    (project_dir / "test_owned.py").write_text("def test_owned(): pass", encoding="utf-8")
    try:
        (project_dir / "test_external.py").symlink_to(external_test)
    except (OSError, NotImplementedError):
        pytest.skip("Symlink creation is unavailable on this platform.")

    service = QualityStudioService(WorkspaceStub(project_dir))
    result = service.discover_project_tests("project-a")
    assert result["test_files"] == ["test_owned.py"]


def test_run_tests_rejects_path_traversal_before_starting_process(tmp_path):
    project_dir = tmp_path / "project-a"
    project_dir.mkdir()
    (project_dir / "test_owned.py").write_text("def test_owned(): pass", encoding="utf-8")
    service = QualityStudioService(WorkspaceStub(project_dir))

    with pytest.raises(PermissionError):
        asyncio.run(service.run_tests("project-a", "../other_project/test_private.py"))


def test_run_tests_rejects_absolute_test_path(tmp_path):
    project_dir = tmp_path / "project-a"
    project_dir.mkdir()
    test_file = project_dir / "test_owned.py"
    test_file.write_text("def test_owned(): pass", encoding="utf-8")
    service = QualityStudioService(WorkspaceStub(project_dir))

    with pytest.raises(PermissionError):
        asyncio.run(service.run_tests("project-a", str(test_file)))


def test_timeout_is_clamped_before_runner_invocation(tmp_path, monkeypatch):
    import sys
    from types import SimpleNamespace

    project_dir = tmp_path / "project-a"
    project_dir.mkdir()
    (project_dir / "test_owned.py").write_text("def test_owned(): pass", encoding="utf-8")
    captured = {}

    class FakeSandbox:
        def __init__(self, default_timeout_seconds, max_output_chars):
            captured["timeout"] = default_timeout_seconds

        async def run_command(self, command, cwd, timeout_seconds):
            captured["command"] = command
            captured["timeout_arg"] = timeout_seconds
            return 0, "1 passed", "", 25.0

    fake_module = SimpleNamespace(
        SandboxTimeoutError=type("SandboxTimeoutError", (Exception,), {}),
        SubprocessSandbox=FakeSandbox,
    )
    monkeypatch.setitem(sys.modules, "services.tool_gateway.sandbox", fake_module)

    service = QualityStudioService(WorkspaceStub(project_dir))
    result = asyncio.run(service.run_tests("project-a", timeout_seconds=9999))

    assert captured["timeout"] == 300
    assert captured["timeout_arg"] == 300
    assert result["is_success"] is True


def test_safe_project_file_helper_rejects_paths_outside_project(tmp_path):
    project_dir = tmp_path / "project-a"
    project_dir.mkdir()
    service = QualityStudioService(WorkspaceStub(project_dir))
    assert not service._is_safe_project_file(project_dir, project_dir.parent / "outside.py")

def test_generated_playwright_script_escapes_user_supplied_strings():
    service = QualityStudioService()
    payload = '"); __import__("os").system("echo injected") #'
    script = service.generate_e2e_playwright_test(
        target_url="http://127.0.0.1:8000",
        scenario_name="safe scenario",
        steps=[{"action": "fill", "target": payload, "value": payload}],
    )
    assert "page.locator(" in script
    assert script.count("__import__") == 1
    assert not any(line.lstrip().startswith("__import__") for line in script.splitlines())
    assert "test_safe_scenario_e2e" in script


def test_generated_playwright_script_ignores_unrecognized_actions():
    service = QualityStudioService()
    script = service.generate_e2e_playwright_test(
        steps=[{"action": "execute_shell", "target": "whoami"}]
    )
    assert "execute_shell" not in script
    assert "whoami" not in script
