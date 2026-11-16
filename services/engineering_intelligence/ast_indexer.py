"""Índice Sintático AST e Análise de Símbolos para Code Intelligence (estilo Cursor / Devin).

Permite navegação sintática de código ('Ir para definição', 'Encontrar referências')
e extração estruturada de classes, métodos, assinaturas e docstrings sem necessidade
de ferramentas pesadas de terceiros.
"""

from __future__ import annotations

import ast
import logging
import re
from dataclasses import asdict, dataclass
from enum import Enum
from pathlib import Path
from typing import Any

logger = logging.getLogger("jarvis.code_intelligence.ast_indexer")

IGNORED_DIRS = {
    ".git",
    ".venv",
    "venv",
    "node_modules",
    "__pycache__",
    "dist",
    "build",
    ".cache",
    ".idea",
    ".vscode",
}


class SymbolKind(str, Enum):
    CLASS = "class"
    FUNCTION = "function"
    METHOD = "method"
    IMPORT = "import"
    VARIABLE = "variable"


@dataclass
class SymbolDefinition:
    name: str
    kind: SymbolKind
    file_path: str
    line: int
    end_line: int
    signature: str = ""
    docstring: str | None = None
    parent: str | None = None

    def to_dict(self) -> dict[str, Any]:
        data = asdict(self)
        data["kind"] = self.kind.value
        return data


@dataclass
class SymbolReference:
    name: str
    file_path: str
    line: int
    context_line: str

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


class PythonASTVisitor(ast.NodeVisitor):
    """Visita a árvore sintática abstrata do Python para extrair definições de símbolos."""

    def __init__(self, file_path: str):
        self.file_path = file_path
        self.symbols: list[SymbolDefinition] = []
        self._current_class: str | None = None

    def visit_ClassDef(self, node: ast.ClassDef) -> None:
        bases = [ast.unparse(b) for b in node.bases]
        sig = f"class {node.name}({', '.join(bases)})" if bases else f"class {node.name}"
        doc = ast.get_docstring(node)

        self.symbols.append(
            SymbolDefinition(
                name=node.name,
                kind=SymbolKind.CLASS,
                file_path=self.file_path,
                line=node.lineno,
                end_line=getattr(node, "end_lineno", node.lineno),
                signature=sig,
                docstring=doc,
                parent=self._current_class,
            )
        )

        prev_class = self._current_class
        self._current_class = node.name
        self.generic_visit(node)
        self._current_class = prev_class

    def visit_FunctionDef(self, node: ast.FunctionDef) -> None:
        self._handle_function(node, is_async=False)

    def visit_AsyncFunctionDef(self, node: ast.AsyncFunctionDef) -> None:
        self._handle_function(node, is_async=True)

    def _handle_function(
        self, node: ast.FunctionDef | ast.AsyncFunctionDef, is_async: bool
    ) -> None:
        args = []
        for arg in node.args.args:
            name = arg.arg
            ann = f": {ast.unparse(arg.annotation)}" if arg.annotation else ""
            args.append(f"{name}{ann}")

        prefix = "async def " if is_async else "def "
        ret = f" -> {ast.unparse(node.returns)}" if node.returns else ""
        sig = f"{prefix}{node.name}({', '.join(args)}){ret}"
        doc = ast.get_docstring(node)

        kind = SymbolKind.METHOD if self._current_class else SymbolKind.FUNCTION
        self.symbols.append(
            SymbolDefinition(
                name=node.name,
                kind=kind,
                file_path=self.file_path,
                line=node.lineno,
                end_line=getattr(node, "end_lineno", node.lineno),
                signature=sig,
                docstring=doc,
                parent=self._current_class,
            )
        )
        self.generic_visit(node)


class ASTIndexer:
    """Indexador de código e repositório por árvore sintática AST."""

    def __init__(self, root_path: str | Path | None = None) -> None:
        self.root_path = Path(root_path or ".").resolve()
        self._definitions: dict[str, list[SymbolDefinition]] = {}
        self._file_symbols: dict[str, list[SymbolDefinition]] = {}
        self._total_indexed_files: int = 0

    def index_project(
        self, project_path: str | Path | None = None, max_files: int = 500
    ) -> dict[str, Any]:
        """Varre o projeto e indexa todos os arquivos de código suportados."""
        root = Path(project_path or self.root_path).resolve()
        self._definitions.clear()
        self._file_symbols.clear()
        self._total_indexed_files = 0

        total_symbols = 0

        for file_path in root.rglob("*.py"):
            if any(part in IGNORED_DIRS for part in file_path.parts):
                continue
            if self._total_indexed_files >= max_files:
                break

            symbols = self._index_python_file(file_path, root)
            if symbols:
                rel_path = file_path.relative_to(root).as_posix()
                self._file_symbols[rel_path] = symbols
                for sym in symbols:
                    self._definitions.setdefault(sym.name, []).append(sym)
                total_symbols += len(symbols)

            self._total_indexed_files += 1

        # Indexa símbolos em TypeScript / JavaScript / Dart via pattern parsing
        for ext in ("*.ts", "*.tsx", "*.js", "*.jsx", "*.dart"):
            for file_path in root.rglob(ext):
                if any(part in IGNORED_DIRS for part in file_path.parts):
                    continue
                if self._total_indexed_files >= max_files:
                    break

                symbols = self._index_pattern_file(file_path, root)
                if symbols:
                    rel_path = file_path.relative_to(root).as_posix()
                    self._file_symbols[rel_path] = symbols
                    for sym in symbols:
                        self._definitions.setdefault(sym.name, []).append(sym)
                    total_symbols += len(symbols)
                self._total_indexed_files += 1

        logger.info(
            "Indexação AST concluída: %d arquivos, %d símbolos identificados.",
            self._total_indexed_files,
            total_symbols,
        )

        return {
            "indexed_files": self._total_indexed_files,
            "unique_symbols": len(self._definitions),
            "total_symbols": total_symbols,
            "root_path": str(root),
        }

    def _index_python_file(self, path: Path, root: Path) -> list[SymbolDefinition]:
        try:
            content = path.read_text(encoding="utf-8", errors="replace")
            tree = ast.parse(content, filename=str(path))
            rel_path = path.relative_to(root).as_posix()
            visitor = PythonASTVisitor(file_path=rel_path)
            visitor.visit(tree)
            return visitor.symbols
        except SyntaxError:
            return []
        except Exception as exc:
            logger.debug("Falha ao indexar arquivo Python %s: %s", path, exc)
            return []

    def _index_pattern_file(self, path: Path, root: Path) -> list[SymbolDefinition]:
        """Indexador leve baseado em regex para linguagens TS/JS/Dart."""
        symbols: list[SymbolDefinition] = []
        try:
            content = path.read_text(encoding="utf-8", errors="replace")
            rel_path = path.relative_to(root).as_posix()
            lines = content.splitlines()

            class_pattern = re.compile(r"^(?:export\s+)?(?:abstract\s+)?class\s+([A-Za-z0-9_]+)")
            func_pattern = re.compile(
                r"^(?:export\s+)?(?:async\s+)?function\s+([A-Za-z0-9_]+)|(?:const|let)\s+([A-Za-z0-9_]+)\s*=\s*(?:async\s*)?\("
            )

            for i, line in enumerate(lines, 1):
                clean = line.strip()
                c_match = class_pattern.search(clean)
                if c_match:
                    name = c_match.group(1)
                    symbols.append(
                        SymbolDefinition(
                            name=name,
                            kind=SymbolKind.CLASS,
                            file_path=rel_path,
                            line=i,
                            end_line=i,
                            signature=clean,
                        )
                    )
                    continue

                f_match = func_pattern.search(clean)
                if f_match:
                    name = f_match.group(1) or f_match.group(2)
                    if name:
                        symbols.append(
                            SymbolDefinition(
                                name=name,
                                kind=SymbolKind.FUNCTION,
                                file_path=rel_path,
                                line=i,
                                end_line=i,
                                signature=clean,
                            )
                        )
        except Exception as exc:
            logger.debug("Falha ao indexar arquivo %s: %s", path, exc)
        return symbols

    def find_definition(self, symbol_name: str) -> list[SymbolDefinition]:
        """Localiza as definições de um símbolo pelo nome."""
        return self._definitions.get(symbol_name.strip(), [])

    def find_references(
        self,
        symbol_name: str,
        project_path: str | Path | None = None,
        max_matches: int = 50,
    ) -> list[SymbolReference]:
        """Localiza ocorrências e chamadas de um símbolo no projeto."""
        root = Path(project_path or self.root_path).resolve()
        references: list[SymbolReference] = []
        pattern = re.compile(r"\b" + re.escape(symbol_name.strip()) + r"\b")

        for file_path in root.rglob("*"):
            if not file_path.is_file() or any(part in IGNORED_DIRS for part in file_path.parts):
                continue
            if file_path.suffix.lower() not in {".py", ".ts", ".tsx", ".js", ".jsx", ".dart"}:
                continue

            try:
                rel_path = file_path.relative_to(root).as_posix()
                lines = file_path.read_text(encoding="utf-8", errors="replace").splitlines()
                for i, line in enumerate(lines, 1):
                    if pattern.search(line):
                        references.append(
                            SymbolReference(
                                name=symbol_name,
                                file_path=rel_path,
                                line=i,
                                context_line=line.strip(),
                            )
                        )
                        if len(references) >= max_matches:
                            return references
            except Exception as exc:
                logger.debug("Falha ao analisar referências em %s: %s", file_path, exc)
                continue

        return references

    def list_file_symbols(self, file_path: str) -> list[SymbolDefinition]:
        """Retorna todos os símbolos definidos em um arquivo específico."""
        clean_path = Path(file_path).as_posix().lstrip("./")
        return self._file_symbols.get(clean_path, [])
