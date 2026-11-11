from datetime import UTC, datetime
from enum import Enum
from typing import Any

from pydantic import BaseModel, Field


class ModelProvider(str, Enum):
    OLLAMA = "ollama"
    MOCK = "mock"
    ONLINE_GATEWAY = "online_gateway"


class ModelRoleMapping(str, Enum):
    DEFAULT_MASTER = "llama3.2:3b"
    DEFAULT_CODER = "qwen2.5-coder:7b"
    DEFAULT_REASONING = "qwen2.5:7b"


class InferenceRequest(BaseModel):
    prompt: str
    system_prompt: str | None = None
    model_name: str = ModelRoleMapping.DEFAULT_MASTER.value
    temperature: float = 0.2
    max_tokens: int | None = 2048
    format_json: bool = False
    contains_sensitive_data: bool = False
    task_id: str | None = None
    # Identidade definida pelo servidor; usada para segregar telemetria por conta.
    owner_user_id: str | None = None
    agent_role: str | None = None
    timeout_seconds: float = 180.0
    # Schema de ferramentas no formato OpenAI ({"type": "function", ...}) ou Anthropic.
    # O adaptador converte quando necessário; vazio desativa tool calling.
    tools: list[dict[str, Any]] = Field(default_factory=list)
    tool_choice: str | None = None
    key_id: str | None = None


class InferenceResponse(BaseModel):
    content: str
    model_name: str
    prompt_tokens: int = 0
    completion_tokens: int = 0
    duration_ms: float = 0.0
    tokens_per_second: float = 0.0
    tool_calls: list[dict[str, Any]] = Field(default_factory=list)
    finish_reason: str = "stop"
    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))


class ModelMetadata(BaseModel):
    name: str
    size_bytes: int
    parameter_size: str
    quantization: str
    family: str
    context_length: int
