from typing import Any, Literal

from pydantic import BaseModel, Field


class ChatRequest(BaseModel):
    prompt: str = Field(..., description="Instrução ou pedido do utilizador")
    session_id: str | None = None
    project_id: str | None = None
    model: str | None = Field(None, description="Modelo de IA específico para a inferência")
    engine: Literal["auto", "orchestrator", "agent"] = Field(
        "auto",
        description=(
            "Motor de resposta: 'auto' usa o agente de chat quando o provedor está "
            "disponível e o pedido não é uma ação de código; 'orchestrator' mantém o "
            "grafo clássico; 'agent' força o runtime conversacional."
        ),
    )


class CodingRunRequest(BaseModel):
    """Pedido de execução do Coding Agent (loop de ferramentas)."""

    prompt: str = Field(..., min_length=1, description="Tarefa solicitada em linguagem natural")
    project_id: str = Field(..., min_length=1, description="ID do projeto no workspace")
    session_id: str | None = Field(None, description="Sessão de conversa (criada se ausente)")
    task_id: str | None = Field(None, description="ID de tarefa para cancelamento via Kill Switch")
    mode: str = Field("ask", description="'plan' (só leitura), 'ask' (aprovação) ou 'auto'")
    model: str | None = Field(None, description="Modelo específico (padrão do provedor se ausente)")
    agent_role: str = Field("backend_developer", description="Papel usado na auditoria de aprovações")
    max_iterations: int = Field(12, ge=1, le=40)
    temperature: float = Field(0.15, ge=0.0, le=1.0)
    max_tokens: int = Field(4096, ge=256, le=32768)
    timeout_seconds: float = Field(180.0, ge=10.0, le=1800.0)
    approval_timeout_seconds: float = Field(900.0, ge=30.0, le=3600.0)
    include_history: bool = True


class CodingApprovalDecision(BaseModel):
    """Decisão humana sobre uma operação do Coding Agent."""

    action: str = Field(..., description="'approve' ou 'reject'")
    decided_by: str | None = Field(
        None, description="Obsoleto: ignorado. A identidade vem da autenticação."
    )
    reason: str | None = None


class UserProfilePayload(BaseModel):
    displayName: str = "Desenvolvedor"
    avatarIcon: str = "💻"
    developerRole: str = "fullstack"
    seniorityLevel: str = "senior"
    responseStyle: str = "concise"
    customInstructions: str = ""
    huggingfaceToken: str = ""
    groqApiKey: str = ""
    geminiApiKey: str = ""


class NetworkIsolationPayload(BaseModel):
    isolated: bool
    reason: str = "Configurado pelo usuário"


class HFInstallPayload(BaseModel):
    model_tag: str


class ApprovalDecisionRequest(BaseModel):
    action: str = Field(..., description="'approve' ou 'reject'")
    # Campo mantido por compatibilidade com clientes antigos.
    # O servidor ignora-o e usa sempre a identidade autenticada.
    decided_by: str | None = Field(
        None, description="Obsoleto: ignorado. A identidade vem da autenticação."
    )
    reason: str | None = None


class KillSwitchRequest(BaseModel):
    target: str = Field(..., description="'global' ou 'task'")
    task_id: str | None = None
    reason: str = "Ação acionada pelo utilizador"


class DevicePairRequest(BaseModel):
    device_name: str = Field(..., description="Nome de identificação do dispositivo móvel")
    scopes: list[str] | None = Field(
        None, description="Scopes autorizados; se ausente usa o conjunto padrão seguro"
    )


class DeviceRevokeRequest(BaseModel):
    device_id: str = Field(..., description="Identificador do dispositivo a revogar")
    reason: str = "Revogação pelo utilizador"


class AssignAgentsRequest(BaseModel):
    agent_roles: list[str] = Field(..., description="Lista de papéis de agentes associados à skill")


class HybridConfigRequest(BaseModel):
    provider_name: str = Field(..., description="Nome do provedor (openai, gemini, groq, deepseek, anthropic, custom)")
    enabled: bool = Field(False, description="Ativar ou desativar o Gateway Online")
    api_key: str | None = Field(None, description="Chave de API do provedor (opcional se já salva)")
    base_url: str | None = Field(None, description="URL base customizada da API")
    default_model: str | None = Field(None, description="Modelo padrão do provedor")
    max_budget_usd: float = Field(5.0, description="Teto máximo de gasto em dólares")


class HybridTestRequest(BaseModel):
    provider_name: str
    api_key: str | None = None
    base_url: str | None = None
    default_model: str | None = None


class ProjectMemoryRequest(BaseModel):
    category: str = Field(..., description="Categoria da memória (ex: architecture, style_guide, decisions)")
    key: str = Field(..., description="Chave identificadora")
    content: str = Field(..., description="Conteúdo ou diretriz")
    sources: list[str] | None = None


class PonytailConfigRequest(BaseModel):
    level: str = "senior"


class CreateSkillRequest(BaseModel):
    id: str | None = None
    name: str
    description: str = ""
    domain: str = "backend"
    instructions: str
    assigned_agents: list[str] = Field(default_factory=lambda: ["jarvis_master"])


class ImportEccSkillRequest(BaseModel):
    content: str
    category: str = "ecc"


class KnowledgeIndexFolderRequest(BaseModel):
    folder_path: str
    category: str = "projeto"


class KnowledgeIndexTextRequest(BaseModel):
    doc_name: str
    content: str
    category: str = "anotacoes"


class KnowledgeSearchRequest(BaseModel):
    query: str
    limit: int = 5


class AgentConfigUpdateRequest(BaseModel):
    system_prompt: str | None = Field(None, description="Prompt de sistema customizado do especialista")
    preferred_model: str | None = Field(None, description="Modelo de IA preferencial")
    allowed_tools: list[str] | None = Field(None, description="Lista de ferramentas autorizadas")
    is_read_only: bool | None = Field(None, description="Permissão do agente: True para Somente Leitura, False para Edição/Proposição")
    assigned_key_id: str | None = Field(None, description="ID da chave de API específica do KeyVault vinculada a este agente")


class AgentMemoryCreateRequest(BaseModel):
    category: str = Field(..., description="Categoria do aprendizado (ex: coding_style, test_preference, security_rule)")
    key: str = Field(..., description="Chave identificadora única")
    content: str = Field(..., description="Conteúdo do aprendizado ou diretriz")
    context: str | None = Field(None, description="Contexto ou tarefa de origem")
    importance: int = Field(default=1, ge=1, le=5, description="Peso da importância de 1 a 5")


class AgentPlaygroundRequest(BaseModel):
    prompt: str = Field(..., description="Instrução direta ao especialista")
    project_id: str | None = Field(None, description="Projeto associado opcional")


class PerformanceModePayload(BaseModel):
    mode: str = Field(default="auto", description="Modo de desempenho: auto, turbo, balanced, eco")
    cpu_threads: int | None = Field(default=None, description="Número de threads de CPU do Ollama")
    eco_model: str | None = Field(default=None, description="Modelo ultraleve para modo de bateria")


class WebhookConfigPayload(BaseModel):
    enabled: bool = Field(default=False, description="Ativação de notificações por webhook")
    discord_webhook_url: str = Field(default="", description="URL do webhook do Discord")
    telegram_bot_token: str = Field(default="", description="Token do bot do Telegram")
    telegram_chat_id: str = Field(default="", description="Chat ID de destino no Telegram")
    notify_on_export: bool = Field(default=True, description="Notificar ao exportar projeto")
    notify_on_dockerize: bool = Field(default=True, description="Notificar ao dockerizar projeto")
    notify_on_long_task: bool = Field(default=True, description="Notificar ao concluir tarefas longas")


class MockEndpointPayload(BaseModel):
    id: str | None = None
    name: str = Field(..., description="Nome amigável do mock endpoint")
    method: str = Field(default="GET", description="Método HTTP (GET, POST, etc.)")
    path: str = Field(..., description="Caminho relativo (ex: /api/users)")
    status_code: int = Field(default=200, description="Código de status HTTP")
    response_body: Any = Field(default={}, description="Corpo JSON da resposta simulada")
    headers: dict[str, str] = Field(default_factory=lambda: {"Content-Type": "application/json"})
    latency_ms: int = Field(default=0, description="Latência artificial em milissegundos")
    enabled: bool = Field(default=True, description="Se o endpoint está ativo")


class SQLQueryPayload(BaseModel):
    db_path: str = Field(..., description="Caminho do arquivo SQLite relativo ao projeto ou absoluto")
    query: str = Field(..., description="Instrução SQL a ser executada")
    project_id: str | None = Field(default=None, description="ID do projeto para resolução de caminho")
    limit: int = Field(default=200, description="Limite máximo de linhas para retorno")


class SQLInspectPayload(BaseModel):
    db_path: str = Field(..., description="Caminho do arquivo SQLite")
    project_id: str | None = Field(default=None, description="ID do projeto")


class SQLAuditPayload(BaseModel):
    db_path: str = Field(..., description="Caminho do arquivo SQLite")
    query: str = Field(..., description="Consulta SELECT para análise de plano")
    project_id: str | None = Field(default=None, description="ID do projeto")


class ApplySecurityPolicyPayload(BaseModel):
    approval_id: str | None = Field(default=None, description="ID da aprovacao humana")
    project_id: str = Field(..., description="ID do projeto onde o arquivo de segurança será salvo")
    template_id: str = Field(..., description="ID do template de política")


class RunTestsPayload(BaseModel):
    project_id: str = Field(..., description="ID do projeto para execução dos testes")
    test_file: str | None = Field(default=None, description="Arquivo de teste específico opcional")
    timeout_seconds: int = Field(default=45, description="Timeout em segundos para conclusão")


class GeneratePlaywrightPayload(BaseModel):
    target_url: str = Field(default="http://127.0.0.1:8000", description="URL alvo da aplicação")
    scenario_name: str = Field(default="fluxo_principal", description="Nome do cenário de teste")
    steps: list[dict[str, str]] | None = Field(default=None, description="Passos do teste")


class ColorPalettePayload(BaseModel):
    hex_primary: str = Field(..., description="Cor primária em formato hexadecimal (ex: #6366f1)")
    name: str = Field(default="custom", description="Nome da paleta")


class WcagAuditPayload(BaseModel):
    markup: str = Field(..., description="Código HTML ou JSX para auditoria de acessibilidade")


class WriteProjectFilePayload(BaseModel):
    path: str = Field(..., description="Caminho relativo do arquivo no projeto")
    content: str = Field(..., description="Conteúdo textual a ser gravado")
    reason: str = Field(default="Modificação aplicada via Artifact Canvas", description="Motivo")
    approval_id: str | None = Field(default=None, description="ID de aprovação humana previamente aprovada")


class ImportFolderPayload(BaseModel):
    folder_path: str = Field(..., description="Caminho absoluto da pasta no computador")
    name: str | None = Field(default=None, description="Nome de identificação do projeto")
    approval_id: str | None = Field(default=None, description="ID de aprovação humana previamente aprovada")


class AutonomousAgentRunRequest(BaseModel):
    """Pedido de execução de especialista autônomo (qualquer um dos 26 agentes)."""

    prompt: str = Field(..., min_length=1, description="Instrução ou tarefa para o especialista")
    project_id: str | None = Field(default=None, description="ID do projeto no workspace (opcional)")
    session_id: str | None = Field(default=None, description="ID da sessão de conversa com o especialista")
    mode: str = Field(default="ask", description="'plan' (só leitura), 'ask' (assistido/aprovação) ou 'auto' (autônomo)")
    max_iterations: int = Field(default=15, ge=1, le=50)
    temperature: float = Field(default=0.3, ge=0.0, le=1.0)
    max_tokens: int = Field(default=2048, ge=256, le=32768)
    timeout_seconds: float = Field(default=180.0, ge=10.0, le=1800.0)
    include_history: bool = True
