"""Módulo de Agentes Especialistas Autônomos do JARVIS AI HUB.

Exporta o AutonomousAgentRuntime para execução com ReAct, tool-calling e
auto-correção para qualquer um dos 26 especialistas do sistema.
"""

from .runtime import AutonomousAgentRuntime

__all__ = [
    "AutonomousAgentRuntime",
]
