"""Agente de código do JARVIS AI HUB (estilo Claude Code / OpenCode).

Exporta o runtime, as ferramentas, o broker de aprovações e os provedores de
modelo com suporte a *tool calling*.
"""

from .broker import ApprovalBroker, ApprovalTicket
from .chat import ChatAgentRuntime, ChatRunConfig
from .context import build_project_context, detect_project_commands
from .providers import (
    AnthropicChatProvider,
    ChatProvider,
    GovernedChatProvider,
    OllamaChatProvider,
    OpenAICompatibleChatProvider,
    ProviderError,
    ResilientChatProvider,
    resolve_chat_provider,
    resolve_governed_chat_provider,
)
from .runtime import CodingAgentRuntime
from .tools import CodingToolExecutor
from .types import (
    AgentMode,
    AgentRunConfig,
    AgentRunResult,
    ChatTurn,
    ProviderReply,
    ToolCall,
    ToolResult,
    ToolRisk,
    ToolSpec,
)

__all__ = [
    "AgentMode",
    "AgentRunConfig",
    "AgentRunResult",
    "AnthropicChatProvider",
    "ApprovalBroker",
    "ApprovalTicket",
    "ChatProvider",
    "ChatRunConfig",
    "ChatAgentRuntime",
    "ChatTurn",
    "CodingAgentRuntime",
    "CodingToolExecutor",
    "GovernedChatProvider",
    "OllamaChatProvider",
    "OpenAICompatibleChatProvider",
    "ProviderError",
    "ProviderReply",
    "ResilientChatProvider",
    "ToolCall",
    "ToolResult",
    "ToolRisk",
    "ToolSpec",
    "build_project_context",
    "detect_project_commands",
    "resolve_chat_provider",
    "resolve_governed_chat_provider",
]
