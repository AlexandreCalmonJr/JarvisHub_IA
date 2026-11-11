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
        description="Executa suíte de testes com timeout e ambiente sanitizado; disponível apenas para administrador até isolamento de SO.",
        category=ToolCategory.TEST_RUNNER,
        requires_approval=False,
    ),
    "run_linter": ToolDefinition(
        name="run_linter",
        description="Executa linter com timeout e ambiente sanitizado; disponível apenas para administrador até isolamento de SO.",
        category=ToolCategory.LINTER,
        requires_approval=False,
    ),
    "web_search": ToolDefinition(
        name="web_search",
        description="Pesquisa na web por informações atualizadas com proteção SSRF e sanitização DLP.",
        category=ToolCategory.SEARCH,
        requires_approval=False,
    ),
    "duckdb_query": ToolDefinition(
        name="duckdb_query",
        description="Executa consulta analítica SQL em alta performance com o motor colunar DuckDB embutido sobre arquivos ou bancos.",
        category=ToolCategory.ANALYTICS,
        requires_approval=False,
    ),
    "scan_secrets": ToolDefinition(
        name="scan_secrets",
        description="Varre o repositório em busca de credenciais, chaves de API, senhas e certificados expostos em texto claro.",
        category=ToolCategory.SECURITY_SCAN,
        requires_approval=False,
    ),
    "scan_sast_patterns": ToolDefinition(
        name="scan_sast_patterns",
        description="Audita o código-fonte estaticamente em busca de vulnerabilidades alinhadas ao OWASP Top 10 (SQLi, Command Injection, etc.).",
        category=ToolCategory.SECURITY_SCAN,
        requires_approval=False,
    ),
    "inspect_dependencies": ToolDefinition(
        name="inspect_dependencies",
        description="Inspeciona manifestos de pacotes (requirements.txt, package.json, pyproject.toml) e lista dependências do projeto.",
        category=ToolCategory.READ_ONLY,
        requires_approval=False,
    ),
    "generate_sbom": ToolDefinition(
        name="generate_sbom",
        description="Gera inventário SBOM (Software Bill of Materials) padronizado no formato CycloneDX para o projeto ativo.",
        category=ToolCategory.READ_ONLY,
        requires_approval=False,
    ),
    "sql_query_explain": ToolDefinition(
        name="sql_query_explain",
        description="Executa EXPLAIN QUERY PLAN em consultas SQL para diagnosticar gargalos de desempenho e ausência de índices.",
        category=ToolCategory.ANALYTICS,
        requires_approval=False,
    ),
    "vector_search": ToolDefinition(
        name="vector_search",
        description="Busca vetorial temporariamente indisponível até existir índice privado por conta.",
        category=ToolCategory.SEARCH,
        requires_approval=False,
    ),
    "write_file": ToolDefinition(
        name="write_file",
        description="Cria ou sobrescreve um arquivo de texto no projeto autorizado sob aprovação humana.",
        category=ToolCategory.MUTATION,
        requires_approval=True,
    ),
    "edit_file": ToolDefinition(
        name="edit_file",
        description="Substitui um trecho específico de texto em um arquivo no projeto autorizado sob aprovação humana.",
        category=ToolCategory.MUTATION,
        requires_approval=True,
    ),
    "delete_file": ToolDefinition(
        name="delete_file",
        description="Remove um arquivo do projeto autorizado sob aprovação humana.",
        category=ToolCategory.MUTATION,
        requires_approval=True,
    ),
    "execute_command": ToolDefinition(
        name="execute_command",
        description="Executa comando de sistema sob aprovação humana; disponível apenas para administrador até isolamento de SO.",
        category=ToolCategory.MUTATION,
        requires_approval=True,
    ),
    "glob_find": ToolDefinition(
        name="glob_find",
        description="Localiza arquivos no projeto autorizado através de padrão glob.",
        category=ToolCategory.SEARCH,
        requires_approval=False,
    ),
    "grep_search": ToolDefinition(
        name="grep_search",
        description="Pesquisa padrões de texto ou regex em arquivos do projeto autorizado.",
        category=ToolCategory.SEARCH,
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

    def list_tools(self) -> list[ToolDefinition]:
        return list(self._tools.values())
