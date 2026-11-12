"""Contratos do runtime de agente de código do JARVIS AI HUB.

Este módulo descreve as mensagens, ferramentas e configurações usadas pelo loop
de agente (estilo Claude Code / OpenCode). Ele é deliberadamente independente de
fornecedor: o mesmo contrato é convertido para OpenAI, Anthropic e Ollama.
"""

from __future__ import annotations

from enum import Enum
from typing import Any, Literal

from pydantic import BaseModel, Field


class ToolRisk(str, Enum):
    """Nível de risco de uma ferramenta."""

    READ = "read"
    WRITE = "write"
    EXEC = "exec"


class AgentMode(str, Enum):
    """Modo de operação do agente."""

    PLAN = "plan"  # Somente leitura; nunca escreve nem executa comandos.
    ASK = "ask"  # Pede aprovação humana antes de escrever/executar.
    AUTO = (
        "auto"  # Autonomia no sandbox; ferramentas protegidas continuam exigindo aprovação humana.
    )


class ToolSpec(BaseModel):
    """Definição de uma ferramenta exposta ao modelo."""

    name: str
    description: str
    parameters: dict[str, Any] = Field(default_factory=dict)
    risk: ToolRisk = ToolRisk.READ
    requires_approval: bool = False
    aliases: list[str] = Field(default_factory=list)

    def to_openai_schema(self) -> dict[str, Any]:
        return {
            "type": "function",
            "function": {
                "name": self.name,
                "description": self.description,
                "parameters": self.parameters,
            },
        }

    def to_anthropic_schema(self) -> dict[str, Any]:
        return {
            "name": self.name,
            "description": self.description,
            "input_schema": self.parameters,
        }


class ToolCall(BaseModel):
    """Chamada de ferramenta emitida pelo modelo."""

    id: str
    name: str
    arguments: dict[str, Any] = Field(default_factory=dict)

    @property
    def display_arguments(self) -> str:
        import json

        try:
            return json.dumps(self.arguments, ensure_ascii=False, indent=2)
        except Exception:
            return str(self.arguments)


class ToolResult(BaseModel):
    """Resultado da execução de uma ferramenta."""

    call_id: str
    name: str
    success: bool
    output: str = ""
    error: str | None = None
    duration_ms: float = 0.0
    exit_code: int | None = None
    changed_files: list[str] = Field(default_factory=list)
    diff: str | None = None
    denied: bool = False

    def to_model_text(self, max_chars: int = 30_000) -> str:
        """Formata o resultado para ser devolvido ao modelo."""
        if self.denied:
            return f"[NEGADO PELO UTILIZADOR] {self.error or 'Operação não autorizada.'}"
        if not self.success:
            return f"[ERRO] {self.error or 'Falha ao executar a ferramenta.'}"
        text = self.output or "(sem saída)"
        if len(text) > max_chars:
            text = text[:max_chars] + f"\n... [saída truncada em {max_chars} caracteres]"
        return text


class ChatTurn(BaseModel):
    """Mensagem interna do histórico do agente."""

    role: Literal["system", "user", "assistant", "tool"] = "user"
    content: str = ""
    tool_calls: list[ToolCall] = Field(default_factory=list)
    tool_call_id: str | None = None
    tool_name: str | None = None


class ProviderReply(BaseModel):
    """Resposta normalizada de um provedor de LLM."""

    content: str = ""
    tool_calls: list[ToolCall] = Field(default_factory=list)
    model: str = ""
    prompt_tokens: int = 0
    completion_tokens: int = 0
    finish_reason: str = "stop"


class AgentRunConfig(BaseModel):
    """Configuração de uma execução do agente."""

    prompt: str
    project_id: str
    session_id: str
    owner_user_id: str | None = None
    task_id: str | None = None
    mode: AgentMode = AgentMode.ASK
    model: str | None = None
    agent_role: str = "backend_developer"
    max_iterations: int = 12
    temperature: float = 0.15
    max_tokens: int = Field(default=1024, ge=256, le=1024)
    timeout_seconds: float = 180.0
    include_history: bool = True
    approval_timeout_seconds: float = 900.0


class AgentRunResult(BaseModel):
    """Resultado consolidado de uma execução."""

    task_id: str
    session_id: str
    project_id: str
    summary: str = ""
    iterations: int = 0
    tool_calls: int = 0
    changed_files: list[str] = Field(default_factory=list)
    is_completed: bool = False
    error: str | None = None
