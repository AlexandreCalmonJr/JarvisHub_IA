"""Testes unitários para o índice sintático AST (services/engineering_intelligence/ast_indexer.py)."""

from pathlib import Path

from services.engineering_intelligence import ASTIndexer, SymbolKind


def test_ast_indexer_extracts_python_classes_and_methods(tmp_path: Path):
    code = """
class Calculator:
    \"\"\"Calculadora simples.\"\"\"
    def add(self, a: int, b: int) -> int:
        return a + b

    async def fetch_pi(self) -> float:
        return 3.14159

def standalone_helper(x: str) -> None:
    pass
"""
    file_path = tmp_path / "calc.py"
    file_path.write_text(code, encoding="utf-8")

    indexer = ASTIndexer(root_path=tmp_path)
    stats = indexer.index_project(project_path=tmp_path)

    assert stats["indexed_files"] == 1
    assert stats["total_symbols"] == 4

    # Busca de definição da classe
    classes = indexer.find_definition("Calculator")
    assert len(classes) == 1
    assert classes[0].kind == SymbolKind.CLASS
    assert "class Calculator" in classes[0].signature
    assert classes[0].docstring == "Calculadora simples."

    # Busca de método
    methods = indexer.find_definition("add")
    assert len(methods) == 1
    assert methods[0].kind == SymbolKind.METHOD
    assert methods[0].parent == "Calculator"

    # Busca de método assíncrono
    async_methods = indexer.find_definition("fetch_pi")
    assert len(async_methods) == 1
    assert "async def" in async_methods[0].signature

    # Busca de função independente
    funcs = indexer.find_definition("standalone_helper")
    assert len(funcs) == 1
    assert funcs[0].kind == SymbolKind.FUNCTION


def test_ast_indexer_find_references(tmp_path: Path):
    file1 = tmp_path / "service.py"
    file1.write_text("class UserService:\n    def get_user(self): pass\n", encoding="utf-8")

    file2 = tmp_path / "controller.py"
    file2.write_text("from service import UserService\ns = UserService()\n", encoding="utf-8")

    indexer = ASTIndexer(root_path=tmp_path)
    indexer.index_project(project_path=tmp_path)

    refs = indexer.find_references("UserService", project_path=tmp_path)
    assert len(refs) >= 2
    files = {r.file_path for r in refs}
    assert "service.py" in files
    assert "controller.py" in files
