from enum import Enum
from typing import Optional, List, Dict, Any
from pydantic import BaseModel, Field
from datetime import datetime, timezone


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
    system_prompt: Optional[str] = None
    model_name: str = ModelRoleMapping.DEFAULT_MASTER.value
    temperature: float = 0.2
    max_tokens: Optional[int] = 2048
    format_json: bool = False
    task_id: Optional[str] = None
    timeout_seconds: float = 60.0


class InferenceResponse(BaseModel):
    content: str
    model_name: str
    prompt_tokens: int = 0
    completion_tokens: int = 0
    duration_ms: float = 0.0
    tokens_per_second: float = 0.0
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class ModelMetadata(BaseModel):
    name: str
    size_bytes: int
    parameter_size: str
    quantization: str
    family: str
    context_length: int
