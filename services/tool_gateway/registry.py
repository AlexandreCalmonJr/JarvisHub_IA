from .types import ToolCategory, ToolDefinition

PERMITTED_TOOLS: dict[str, ToolDefinition] = {
    "read_file": ToolDefinition(
        name="read_file",
        description="Lê o conteúdo de um arquivo de texto dentro do projeto autorizado.",
        category=ToolCategory.READ_ONLY,
        requires_approval=False,
    ),
    "list_directory": ToolDefinition(
        name="list_directory",
        description="Lista arquivos e diretórios dentro do projeto autorizado.",
        category=ToolCategory.READ_ONLY,
        requires_approval=False,
    ),
    "search_code": ToolDefinition(
        name="search_code",
        description="Pesquisa padrões de texto ou regex dentro dos arquivos do projeto.",
        category=ToolCategory.SEARCH,
        requires_approval=False,
    ),
    "git_status": ToolDefinition(
        name="git_status",
        description="Consulta o status atual do repositório Git no projeto.",
        category=ToolCategory.GIT_READ,
        requires_approval=False,
    ),
    "git_diff": ToolDefinition(
        name="git_diff",
        description="Inspeciona o diff unificado de alterações no projeto.",
        category=ToolCategory.GIT_READ,
        requires_approval=False,
    ),
    "run_tests": ToolDefinition(
        name="run_tests",
        description="Executa suíte de testes (ex: pytest ou flutter test) em sandbox isolada.",
        category=ToolCategory.TEST_RUNNER,
        requires_approval=False,  # Em modo test_approved
    ),
    "run_linter": ToolDefinition(
        name="run_linter",
        description="Executa linter de código (ex: ruff ou flutter analyze) em sandbox.",
        category=ToolCategory.LINTER,
        requires_approval=False,
    ),
}


class ToolRegistry:
    """Catálogo central de ferramentas permitidas. Impede execução de utilitários arbitrários de sistema."""

    def __init__(self):
        self._tools = dict(PERMITTED_TOOLS)

    def get_tool(self, name: str) -> ToolDefinition | None:
        return self._tools.get(name)

    def is_permitted(self, name: str) -> bool:
        return name in self._tools
