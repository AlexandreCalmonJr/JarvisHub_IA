"""
Syntactic Repository Map Generator for JARVIS AI HUB.
Extracts AST-level signatures (classes, methods, functions) from Python, TypeScript,
JavaScript, Go, and Rust files, ranked by structural relevance into a compact (<1,000 tokens)
architectural overview for LLM system prompts (inspired by Aider / Claude Code).
"""

from __future__ import annotations

import ast
import logging
import os
import re
from dataclasses import dataclass, field
from pathlib import Path

logger = logging.getLogger("jarvis.coding_agent.repo_map")

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
    ".idea",
    ".vscode",
}

SUPPORTED_EXTENSIONS = {".py", ".ts", ".tsx", ".js", ".jsx", ".go", ".rs"}


@dataclass
class SymbolDef:
    name: str
    kind: str  # "class", "method", "function", "interface", "type"
    signature: str = ""
    methods: list[SymbolDef] = field(default_factory=list)


@dataclass
class FileSymbols:
    path: str
    symbols: list[SymbolDef] = field(default_factory=list)
    score: float = 1.0


class RepoMapGenerator:
    """
    Generates ultra-compact AST syntax maps of repositories for LLM context injection.
    """

    def __init__(self, cache_dir: Path | None = None):
        self.cache_dir = cache_dir or Path("data/.repo_map_cache")
        self.cache_dir.mkdir(parents=True, exist_ok=True)

    def generate(self, root: Path, max_tokens: int = 1000) -> str:
        """
        Scans repository, extracts AST signatures, ranks files, and packs into <= max_tokens string.
        (1 token ~= 4 characters).
        """
        max_chars = max_tokens * 4
        root = root.resolve()
        if not root.is_dir():
            return ""

        file_symbols = self._collect_repo_symbols(root)
        if not file_symbols:
            return ""

        # Rank files by relevance score
        file_symbols.sort(key=lambda x: x.score, reverse=True)

        # Render into compact tree representation within budget
        output_lines: list[str] = []
        current_chars = 0

        for fs in file_symbols:
            file_header = f"{fs.path}:"
            item_lines: list[str] = [file_header]

            for sym in fs.symbols:
                if sym.kind in ("class", "interface"):
                    item_lines.append(f"  {sym.kind} {sym.signature or sym.name}:")
                    for method in sym.methods:
                        item_lines.append(f"    def {method.signature or method.name}")
                elif sym.kind in ("function", "type"):
                    sig = sym.signature or sym.name
                    item_lines.append(f"  def {sig}" if sym.kind == "function" else f"  type {sig}")

            block = "\n".join(item_lines) + "\n"
            if current_chars + len(block) > max_chars:
                # Add compact indicator and break
                remaining = len(file_symbols) - len(output_lines)
                if remaining > 0:
                    output_lines.append(f"... [+ {remaining} outros módulos mapeados]")
                break

            output_lines.append(block)
            current_chars += len(block)

        return "\n".join(output_lines).strip()

    def _collect_repo_symbols(self, root: Path) -> list[FileSymbols]:
        """Collects symbols from all supported files in the repo."""
        result: list[FileSymbols] = []
        files: list[tuple[Path, str]] = []

        for dirpath, dirnames, filenames in os.walk(root):
            dirnames[:] = [d for d in dirnames if d not in IGNORED_DIRS and not d.startswith(".")]
            rel_dir = Path(dirpath).relative_to(root)
            for fname in filenames:
                ext = Path(fname).suffix.lower()
                if ext in SUPPORTED_EXTENSIONS:
                    full_p = Path(dirpath) / fname
                    rel_p = (rel_dir / fname).as_posix() if str(rel_dir) != "." else fname
                    files.append((full_p, rel_p))

        for full_p, rel_p in files:
            symbols = self._parse_file(full_p)
            if symbols:
                score = self._compute_file_score(rel_p)
                result.append(FileSymbols(path=rel_p, symbols=symbols, score=score))

        return result

    def _parse_file(self, path: Path) -> list[SymbolDef]:
        """Parses an individual file into AST symbol definitions."""
        ext = path.suffix.lower()
        try:
            content = path.read_text(encoding="utf-8", errors="replace")
        except Exception:
            return []

        if ext == ".py":
            return self._parse_python(content)
        elif ext in (".ts", ".tsx", ".js", ".jsx"):
            return self._parse_typescript(content)
        elif ext == ".go":
            return self._parse_go(content)
        elif ext == ".rs":
            return self._parse_rust(content)
        return []

    def _parse_python(self, content: str) -> list[SymbolDef]:
        """Parses Python code using the standard library ast module."""
        symbols: list[SymbolDef] = []
        try:
            tree = ast.parse(content)
        except SyntaxError:
            return []

        for node in tree.body:
            if isinstance(node, ast.ClassDef):
                bases = [self._format_ast_expr(b) for b in node.bases]
                base_str = f"({', '.join(bases)})" if bases else ""
                class_sym = SymbolDef(
                    name=node.name, kind="class", signature=f"{node.name}{base_str}"
                )
                for item in node.body:
                    if isinstance(item, (ast.FunctionDef, ast.AsyncFunctionDef)):
                        sig = self._format_func_signature(item)
                        class_sym.methods.append(
                            SymbolDef(name=item.name, kind="method", signature=sig)
                        )
                symbols.append(class_sym)

            elif isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
                sig = self._format_func_signature(node)
                symbols.append(SymbolDef(name=node.name, kind="function", signature=sig))

        return symbols

    def _format_func_signature(self, node: ast.FunctionDef | ast.AsyncFunctionDef) -> str:
        """Extracts concise parameter signature from an AST function node."""
        args_list = []
        for a in node.args.args:
            if a.arg in ("self", "cls"):
                continue
            ann = f": {self._format_ast_expr(a.annotation)}" if a.annotation else ""
            args_list.append(f"{a.arg}{ann}")
        ret = f" -> {self._format_ast_expr(node.returns)}" if node.returns else ""
        return f"{node.name}({', '.join(args_list)}){ret}"

    def _format_ast_expr(self, expr: ast.AST | None) -> str:
        """Converts an AST expression back to a short string representation."""
        if expr is None:
            return ""
        if isinstance(expr, ast.Name):
            return expr.id
        elif isinstance(expr, ast.Attribute):
            return f"{self._format_ast_expr(expr.value)}.{expr.attr}"
        elif isinstance(expr, ast.Subscript):
            return f"{self._format_ast_expr(expr.value)}[{self._format_ast_expr(expr.slice)}]"
        elif isinstance(expr, ast.Constant):
            return repr(expr.value)
        return ""

    def _parse_typescript(self, content: str) -> list[SymbolDef]:
        """Regex-based parser for TypeScript/JavaScript declarations."""
        symbols: list[SymbolDef] = []

        # Classes and Interfaces
        for m in re.finditer(
            r"export\s+(class|interface)\s+([A-Za-z0-9_]+)(<[^>]+>)?(\s+extends\s+[A-Za-z0-9_]+)?",
            content,
        ):
            kind = m.group(1)
            name = m.group(2)
            symbols.append(SymbolDef(name=name, kind=kind, signature=name))

        # Functions
        for m in re.finditer(
            r"export\s+(?:async\s+)?function\s+([A-Za-z0-9_]+)\s*\(([^)]*)\)", content
        ):
            name = m.group(1)
            raw_args = m.group(2)
            clean_args = ", ".join(
                [a.split(":")[0].strip() for a in raw_args.split(",") if a.strip()]
            )
            symbols.append(SymbolDef(name=name, kind="function", signature=f"{name}({clean_args})"))

        # Types
        for m in re.finditer(r"export\s+type\s+([A-Za-z0-9_]+)", content):
            name = m.group(1)
            symbols.append(SymbolDef(name=name, kind="type", signature=name))

        return symbols

    def _parse_go(self, content: str) -> list[SymbolDef]:
        symbols: list[SymbolDef] = []
        for m in re.finditer(r"type\s+([A-Za-z0-9_]+)\s+(struct|interface)", content):
            symbols.append(
                SymbolDef(name=m.group(1), kind="class", signature=f"{m.group(1)} {m.group(2)}")
            )
        for m in re.finditer(r"func\s+(?:\([^)]+\)\s+)?([A-Za-z0-9_]+)\s*\(([^)]*)\)", content):
            symbols.append(SymbolDef(name=m.group(1), kind="function", signature=m.group(1)))
        return symbols

    def _parse_rust(self, content: str) -> list[SymbolDef]:
        symbols: list[SymbolDef] = []
        for m in re.finditer(r"pub\s+(?:struct|enum|trait)\s+([A-Za-z0-9_]+)", content):
            symbols.append(SymbolDef(name=m.group(1), kind="class", signature=m.group(1)))
        for m in re.finditer(r"pub\s+(?:async\s+)?fn\s+([A-Za-z0-9_]+)", content):
            symbols.append(SymbolDef(name=m.group(1), kind="function", signature=m.group(1)))
        return symbols

    def _compute_file_score(self, rel_path: str) -> float:
        """Calculates architectural prominence score for ranking."""
        p = rel_path.lower()
        score = 1.0

        # Core directories get higher priority
        if p.startswith(("services/", "src/", "apps/")):
            score += 2.0
        if "main." in p or "__init__." in p or "app." in p or "index." in p:
            score += 1.5

        # Penalize test files or mocks to save token budget for production code
        if "test" in p or "mock" in p or "spec" in p:
            score -= 1.5

        return max(score, 0.1)


def generate_repo_map(project_root: Path, max_tokens: int = 1000) -> str:
    """Convenience helper to generate a compact repo map."""
    generator = RepoMapGenerator()
    return generator.generate(root=project_root, max_tokens=max_tokens)
