"""Construção de contexto de projeto para o agente de código.

Gera um mapa compacto do repositório e injeta instruções persistidas do projeto
(JARVIS.md / AGENTS.md / CLAUDE.md), respeitando limites de tamanho para não
estourar a janela de contexto de modelos locais.
"""

from __future__ import annotations

import os
from pathlib import Path

IGNORED_DIRS = {
    ".git",
    ".hg",
    ".svn",
    ".venv",
    "venv",
    "env",
    "node_modules",
    "__pycache__",
    ".pytest_cache",
    ".ruff_cache",
    ".mypy_cache",
    ".next",
    ".nuxt",
    "dist",
    "build",
    "target",
    "bin",
    "obj",
    "coverage",
    ".dart_tool",
    ".gradle",
    ".idea",
    ".vscode",
    ".turbo",
    ".cache",
    "vendor",
    "Pods",
    ".terraform",
}

INSTRUCTION_FILES = ("JARVIS.md", "AGENTS.md", "CLAUDE.md", "README.md")

TEXT_EXTENSIONS = {
    ".py",
    ".ts",
    ".tsx",
    ".js",
    ".jsx",
    ".mjs",
    ".cjs",
    ".json",
    ".md",
    ".txt",
    ".toml",
    ".yaml",
    ".yml",
    ".ini",
    ".cfg",
    ".env",
    ".sql",
    ".html",
    ".css",
    ".scss",
    ".sass",
    ".less",
    ".vue",
    ".svelte",
    ".go",
    ".rs",
    ".java",
    ".kt",
    ".kts",
    ".cs",
    ".csproj",
    ".sln",
    ".c",
    ".h",
    ".cpp",
    ".hpp",
    ".dart",
    ".swift",
    ".rb",
    ".php",
    ".sh",
    ".ps1",
    ".bat",
    ".dockerfile",
    ".tf",
}


def _is_probably_text(path: Path) -> bool:
    if path.suffix.lower() in TEXT_EXTENSIONS:
        return True
    return path.name in {"Dockerfile", "Makefile", "Procfile", "LICENSE", "requirements.txt"}


def _read_limited(path: Path, max_chars: int) -> str:
    try:
        data = path.read_text(encoding="utf-8", errors="replace")
    except Exception:
        return ""
    if len(data) > max_chars:
        return data[:max_chars] + f"\n... [instruções truncadas em {max_chars} caracteres]"
    return data


def _walk_files(root: Path, max_files: int = 600) -> list[str]:
    files: list[str] = []
    for dirpath, dirnames, filenames in os.walk(root):
        dirnames[:] = [d for d in dirnames if d not in IGNORED_DIRS and not d.startswith(".")]
        rel_dir = Path(dirpath).relative_to(root)
        for name in filenames:
            if name.startswith(".") and name not in {".env.example", ".gitignore"}:
                continue
            rel = (rel_dir / name).as_posix() if str(rel_dir) != "." else name
            files.append(rel)
            if len(files) >= max_files:
                return files
    return files


def build_project_context(
    project_root: Path,
    project_id: str,
    max_tree_chars: int = 14_000,
    max_instruction_chars: int = 6_000,
) -> str:
    """Monta um bloco de contexto do projeto para o system prompt."""
    root = project_root.resolve()
    if not root.exists() or not root.is_dir():
        return f"Projeto '{project_id}': diretório não encontrado."

    files = _walk_files(root)
    tree_lines = [f"- {f}" for f in files]
    tree = "\n".join(tree_lines) if tree_lines else "(projeto vazio)"
    if len(tree) > max_tree_chars:
        tree = tree[:max_tree_chars] + f"\n... [árvore truncada: {len(files)} arquivos encontrados]"

    instructions: list[str] = []
    for name in INSTRUCTION_FILES:
        candidate = root / name
        if candidate.is_file():
            content = _read_limited(candidate, max_instruction_chars)
            if content.strip():
                instructions.append(f"### {name}\n{content.strip()}")

    sections = [
        f"## PROJETO ATIVO: {project_id}",
        f"Raiz autorizada: {root}",
        "",
        "## ÁRVORE DE ARQUIVOS (respeitando .gitignore/ignorados comuns)",
        tree,
    ]
    if instructions:
        sections.extend(["", "## INSTRUÇÕES PERSISTIDAS DO PROJETO", "\n\n".join(instructions)])
    return "\n".join(sections)


def detect_project_commands(root: Path) -> dict[str, str]:
    """Detecta comandos comuns do projeto para orientar o agente."""
    commands: dict[str, str] = {}
    if (root / "package.json").exists():
        commands["test"] = "npm test"
        commands["build"] = "npm run build"
        commands["lint"] = "npm run lint"
    if (root / "pyproject.toml").exists() or (root / "pytest.ini").exists():
        commands["test"] = "python -m pytest"
        commands["lint"] = "ruff check ."
    elif (root / "requirements.txt").exists():
        commands["test"] = "python -m pytest"
    if (root / "pubspec.yaml").exists():
        commands["test"] = "flutter test"
        commands["lint"] = "flutter analyze"
    if (root / "pom.xml").exists():
        commands["test"] = "mvn test"
        commands["build"] = "mvn package"
    if (root / "go.mod").exists():
        commands["test"] = "go test ./..."
        commands["build"] = "go build ./..."
    if any(p.suffix == ".csproj" for p in root.glob("*.csproj")):
        commands["test"] = "dotnet test"
        commands["build"] = "dotnet build"
    return commands
