"""Runtime de chat conversacional com memória e streaming real.

O chat clássico do dashboard era servido pelo grafo heurístico e não enviava o
histórico ao modelo. Este módulo reutiliza a mesma camada de provedores do
Coding Agent para entregar respostas reais, em pt-BR, com histórico persistido
por mensagem.

Ele é polivalente e inteligente:
- Atende com naturalidade a conversação humana, estudos de idiomas, redação e raciocínio;
- Aplica rigor técnico e artefatos de código quando o usuário solicita desenvolvimento;
- Integra busca web segura (Safe Web Search) de forma transparente para dados atualizados.
"""

from __future__ import annotations

import logging
import re
import uuid
from collections.abc import AsyncIterator, Callable
from typing import Any

from pydantic import BaseModel

from .context import build_project_context
from .providers import ChatProvider, ProviderError
from .types import ChatTurn

logger = logging.getLogger("jarvis.chat.runtime")

MAX_HISTORY_MESSAGES = 40

WEB_SEARCH_TRIGGERS = [
    r"\b(?:pesquis(?:e|ar)|busqu(?:e|ar)|procur(?:e|ar))\s+(?:na\s+web|na\s+internet|no\s+google|online)?\b",
    r"\b(?:not[íi]cias?|novidades?|notici[áa]rio)\b",
    r"\b(?:pesquise|busque|procure)\s+sobre\b",
    r"\bcomo\s+est[áa]\b",
    r"\batualizado\b|\brecente\b|\bhoje\b|\b202[4-9]\b",
]


def _should_perform_web_search(prompt: str) -> bool:
    """Verifica se o pedido se beneficiará de dados atualizados da web."""
    lowered = prompt.lower()
    return any(re.search(pat, lowered, re.IGNORECASE) for pat in WEB_SEARCH_TRIGGERS)


SYSTEM_PROMPT = """Você é o JARVIS AI, um assistente inteligente soberano de alta capacidade, articulado, empático e focado em excelência.
Você atende tanto a conversas humanas naturais, estudos e raciocínio geral, quanto à engenharia de software avançada.
Responda sempre em português do Brasil com clareza, objetividade e elegância.

---

## 1. COMPORTAMENTO CONVERSACIONAL E RACIOCÍNIO GERAL (PADRÃO)
- Para perguntas conceituais, educacionais, estudos de idiomas (como inglês), redação, dúvidas cotidianas, carreira ou planejamento:
  - Responda como uma IA conversacional moderna e acolhedora (estilo Claude / ChatGPT / Gemini).
  - Use raciocínio claro, dividindo explicações em tópicos didáticos, exemplos do mundo real, rotinas práticas e passos acionáveis.
  - Jamais imponha jargões ou tecnologias de computação (como FastAPI, SQLite, Docker, React) quando a pergunta não for sobre programação.

---

## 2. DESENVOLVIMENTO DE SOFTWARE & ARTEFATOS (QUANDO SOLICITADO CÓDIGO/UI)
- Quando o usuário pedir para criar, modificar, analisar ou arquitetar código, telas, APIs ou componentes:
  - Adote as melhores práticas de Clean Code, tipagem estrita e padrões modulares.
  - Se for criação de frontend ou artefatos visuais interativos, forneça código completo e executável (React/TypeScript, Tailwind CSS ou HTML/CSS).
  - Isole componentes reutilizáveis e respeite o layout e design tokens do projeto.

---

## 3. PESQUISA NA WEB E REFERÊNCIAS EXTERNAS
- Quando resultados de busca na web estiverem presentes no contexto, sintetize as informações com precisão, atualize sua resposta com fatos verificados e cite as fontes de forma limpa.
"""


class ChatRunConfig(BaseModel):
    """Configuração de uma resposta conversacional."""

    prompt: str
    session_id: str
    owner_user_id: str | None = None
    project_id: str | None = None
    model: str | None = None
    system_prompt: str | None = None
    temperature: float = 0.3
    max_tokens: int = 1024
    timeout_seconds: float = 180.0
    include_history: bool = True


class ChatAgentRuntime:
    """Gera respostas reais com memória persistida e streaming de tokens."""

    def __init__(
        self,
        provider_factory: Callable[[], ChatProvider],
        db_manager: Any | None = None,
        workspace_service: Any | None = None,
        max_history_messages: int = MAX_HISTORY_MESSAGES,
    ):
        self.provider_factory = provider_factory
        self.db_manager = db_manager
        self.workspace_service = workspace_service
        self.max_history_messages = max_history_messages

    # ------------------------------------------------------------------
    # Execução
    # ------------------------------------------------------------------
    async def run(self, config: ChatRunConfig) -> AsyncIterator[dict[str, Any]]:
        """Executa uma resposta e emite eventos SSE compatíveis com o ChatMaster."""
        session_id = config.session_id or f"chat-{uuid.uuid4().hex[:10]}"
        prompt = config.prompt.strip()
        if not prompt:
            yield {
                "type": "error",
                "code": "internal",
                "error": "Mensagem vazia.",
                "session_id": session_id,
            }
            return

        provider = self.provider_factory()
        model = provider.resolve_model(config.model)

        turns, sources = await self._build_turns(config, session_id, prompt)
        self._persist(session_id, config.project_id, "user", prompt, config.owner_user_id)

        yield {
            "type": "start",
            "session_id": session_id,
            "model": model,
            "provider": provider.name,
            "engine": "agent",
            "sources": sources,
        }

        collected: list[str] = []
        try:
            async for chunk in provider.stream(
                turns=turns,
                tools=[],
                model=config.model,
                temperature=config.temperature,
                max_tokens=config.max_tokens,
                timeout_seconds=config.timeout_seconds,
            ):
                if not chunk:
                    continue
                collected.append(chunk)
                yield {"type": "token", "chunk": chunk}
        except ProviderError as exc:
            message = str(exc)
            logger.warning("Falha do provedor no chat (%s): %s", provider.name, message)
            if collected:
                self._persist(
                    session_id,
                    config.project_id,
                    "assistant",
                    "".join(collected),
                    config.owner_user_id,
                )
            yield {
                "type": "error",
                "code": "timeout"
                if "timeout" in message.casefold() or "tempo limite" in message.casefold()
                else "provider_unavailable",
                "error": message,
                "session_id": session_id,
                "provider": provider.name,
            }
            return
        except Exception as exc:  # pragma: no cover - defensivo
            logger.exception("Erro inesperado no chat")
            yield {
                "type": "error",
                "code": "internal",
                "error": f"Falha interna do chat: {exc}",
                "session_id": session_id,
            }
            return

        content = "".join(collected).strip()
        if content:
            self._persist(session_id, config.project_id, "assistant", content, config.owner_user_id)

        yield {
            "type": "done",
            "session_id": session_id,
            "is_completed": True,
            "final_summary": content,
            "engine": "agent",
            "model": model,
            "provider": provider.name,
            "sources": sources,
        }

    async def complete(self, config: ChatRunConfig) -> dict[str, Any]:
        """Versão não-streaming usada pelo endpoint JSON ``/api/v1/chat``."""
        session_id = config.session_id or f"chat-{uuid.uuid4().hex[:10]}"
        provider = self.provider_factory()
        turns, sources = await self._build_turns(config, session_id, config.prompt)
        self._persist(session_id, config.project_id, "user", config.prompt, config.owner_user_id)
        reply = await provider.complete(
            turns=turns,
            tools=[],
            model=config.model,
            temperature=config.temperature,
            max_tokens=config.max_tokens,
            timeout_seconds=config.timeout_seconds,
        )
        content = (reply.content or "").strip()
        if content:
            self._persist(session_id, config.project_id, "assistant", content, config.owner_user_id)
        return {
            "engine": "agent",
            "session_id": session_id,
            "model": reply.model or provider.resolve_model(config.model),
            "provider": provider.name,
            "final_summary": content,
            "is_completed": True,
            "approval_required": False,
            "classified_intent": "conversation",
            "selected_agents": ["jarvis_master"],
            "plan_steps": [],
            "sources": sources,
        }

    # ------------------------------------------------------------------
    # Contexto e memória
    # ------------------------------------------------------------------
    async def _build_turns(
        self, config: ChatRunConfig, session_id: str, prompt: str
    ) -> tuple[list[ChatTurn], list[dict[str, str]]]:
        system = (config.system_prompt or SYSTEM_PROMPT).strip()
        sources: list[dict[str, str]] = []

        # Enriquecimento com busca web segura caso relevante
        if _should_perform_web_search(prompt):
            try:
                from services.tool_gateway.web_search import safe_web_search

                search_results = await safe_web_search.search(
                    prompt, max_results=3, timeout_seconds=3.5
                )
                if search_results:
                    web_context = "\n\n### Resultados Recentes da Web (fontes públicas):\n"
                    for r in search_results:
                        web_context += f"- **{r.title}**: {r.snippet} (Fonte: {r.url}; coletado: {r.retrieved_at})\n"
                        sources.append(
                            {"title": r.title, "url": r.url, "retrieved_at": r.retrieved_at}
                        )
                    web_context += "\nUtilize as informações acima para enriquecer sua explicação com dados atualizados e cite as referências."
                    system += web_context
            except Exception as exc:
                logger.debug("Busca web segura ignorada ou indisponível: %s", exc)
                system += "\n\nA busca web falhou. Informe que a busca está indisponível e não invente resultados atuais nem fontes."

        if config.project_id and self.workspace_service is not None:
            try:
                root = self.workspace_service.get_project_dir(config.project_id)
                if root.exists():
                    system += "\n\n" + build_project_context(root, config.project_id)
            except Exception as exc:
                logger.debug("Contexto do projeto indisponível: %s", exc)

        turns: list[ChatTurn] = [ChatTurn(role="system", content=system)]
        if config.include_history and self.db_manager is not None:
            try:
                history = self.db_manager.list_chat_messages(
                    session_id,
                    limit=self.max_history_messages,
                    owner_user_id=config.owner_user_id,
                )
                for row in history:
                    if row.get("role") not in {"user", "assistant"}:
                        continue
                    content = (row.get("content") or "").strip()
                    if content:
                        turns.append(ChatTurn(role=row["role"], content=content))
            except Exception as exc:
                logger.warning("Falha ao carregar histórico do chat %s: %s", session_id, exc)
        turns.append(ChatTurn(role="user", content=prompt))
        return turns, sources

    def _persist(
        self,
        session_id: str,
        project_id: str | None,
        role: str,
        content: str,
        owner_user_id: str | None = None,
    ) -> None:
        if self.db_manager is None or not content:
            return
        try:
            self.db_manager.add_chat_message(
                session_id=session_id,
                role=role,
                content=content,
                project_id=project_id,
                owner_user_id=owner_user_id,
            )
        except Exception as exc:  # pragma: no cover - defensivo
            logger.warning("Falha ao persistir mensagem do chat: %s", exc)
