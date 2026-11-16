"""Motor de compactação semântica de contexto e histórico (estilo Claude Code /compact).

Reduz o consumo de tokens e a poluição do contexto através da consolidação
inteligente de chamadas de ferramentas antigas, saídas volumosas e turnos
intermediários, mantendo intactos os turnos recentes e o estado do projeto.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any

from .types import ChatTurn

logger = logging.getLogger("jarvis.coding.compactor")


@dataclass
class CompactionStats:
    """Métricas de redução da compactação de contexto."""

    original_turns: int
    compacted_turns: int
    original_chars: int
    compacted_chars: int
    estimated_tokens_saved: int
    summary: str

    def to_dict(self) -> dict[str, Any]:
        return {
            "original_turns": self.original_turns,
            "compacted_turns": self.compacted_turns,
            "original_chars": self.original_chars,
            "compacted_chars": self.compacted_chars,
            "estimated_tokens_saved": self.estimated_tokens_saved,
            "reduction_percent": round(
                (1.0 - (self.compacted_chars / max(1, self.original_chars))) * 100.0, 1
            ),
            "summary": self.summary,
        }


class ContextCompactor:
    """Compactador semântico de histórico de conversa e ferramentas."""

    def __init__(self, keep_recent: int = 4, max_summary_chars: int = 4000) -> None:
        self.keep_recent = max(2, keep_recent)
        self.max_summary_chars = max_summary_chars

    def compact_turns(
        self,
        turns: list[ChatTurn],
        keep_recent: int | None = None,
    ) -> tuple[list[ChatTurn], CompactionStats]:
        """Compacta uma lista de ChatTurn preservando as mensagens recentes intactas."""
        cutoff = self.keep_recent if keep_recent is None else max(2, keep_recent)
        total_turns = len(turns)

        original_chars = sum(len(t.content or "") for t in turns)

        if total_turns <= cutoff:
            stats = CompactionStats(
                original_turns=total_turns,
                compacted_turns=total_turns,
                original_chars=original_chars,
                compacted_chars=original_chars,
                estimated_tokens_saved=0,
                summary="Histórico já está compacto (poucos turnos para compactar).",
            )
            return turns, stats

        older_turns = turns[:-cutoff]
        recent_turns = turns[-cutoff:]

        # Extração semântica dos turnos antigos
        user_goals: list[str] = []
        files_inspected: set[str] = set()
        files_modified: set[str] = set()
        commands_run: list[str] = []
        key_findings: list[str] = []

        for turn in older_turns:
            content = (turn.content or "").strip()
            if turn.role == "user" and content:
                # Evita duplicar resumos já compactados
                if not content.startswith("[SESSÃO COMPACTADA"):
                    user_goals.append(content[:150] + ("..." if len(content) > 150 else ""))
            elif turn.role == "assistant":
                if turn.tool_calls:
                    for call in turn.tool_calls:
                        args = call.arguments or {}
                        if call.name in {"read_file", "glob", "grep", "list_directory"}:
                            path = args.get("path") or args.get("pattern") or args.get("directory")
                            if path:
                                files_inspected.add(str(path))
                        elif call.name in {"write_file", "edit_file"}:
                            path = args.get("path")
                            if path:
                                files_modified.add(str(path))
                        elif call.name == "run_command":
                            cmd = args.get("command") or args.get("cmd")
                            if cmd:
                                commands_run.append(str(cmd)[:80])
                elif content and len(content) > 20:
                    # Captura deduções ou resumos do assistente
                    key_findings.append(content[:200] + ("..." if len(content) > 200 else ""))
            elif turn.role == "tool" and turn.tool_name:
                if turn.tool_name in {"edit_file", "write_file"}:
                    if "sucesso" in content.lower() or "alterado" in content.lower():
                        key_findings.append(f"Edição em '{turn.tool_name}' aplicada.")

        # Montagem do bloco de resumo consolidado
        timestamp = datetime.now(UTC).strftime("%d/%m/%Y %H:%M:%S UTC")
        summary_lines = [
            f"[SESSÃO COMPACTADA AUTOMATICAMENTE EM {timestamp}]",
            f"Turnos anteriores compactados: {len(older_turns)}.",
        ]

        if user_goals:
            summary_lines.append("\n**Objetivos do Usuário no Trecho Compactado:**")
            for goal in user_goals[:5]:
                summary_lines.append(f"- {goal}")

        if files_inspected:
            summary_lines.append("\n**Arquivos e Padrões Analisados:**")
            summary_lines.append(f"- {', '.join(sorted(files_inspected)[:10])}")

        if files_modified:
            summary_lines.append("\n**Arquivos Modificados:**")
            summary_lines.append(f"- {', '.join(sorted(files_modified)[:10])}")

        if commands_run:
            summary_lines.append("\n**Comandos Executados:**")
            for cmd in commands_run[:5]:
                summary_lines.append(f"- `{cmd}`")

        if key_findings:
            summary_lines.append("\n**Principais Ações e Conclusões:**")
            for finding in key_findings[:3]:
                summary_lines.append(f"- {finding}")

        summary_text = "\n".join(summary_lines)
        if len(summary_text) > self.max_summary_chars:
            summary_text = summary_text[: self.max_summary_chars] + "\n... [resumo truncado]"

        compact_turn = ChatTurn(
            role="user",
            content=summary_text,
        )

        compacted_turns = [compact_turn] + recent_turns
        compacted_chars = sum(len(t.content or "") for t in compacted_turns)
        chars_saved = max(0, original_chars - compacted_chars)
        estimated_tokens_saved = chars_saved // 4

        stats = CompactionStats(
            original_turns=total_turns,
            compacted_turns=len(compacted_turns),
            original_chars=original_chars,
            compacted_chars=compacted_chars,
            estimated_tokens_saved=estimated_tokens_saved,
            summary=f"Compactado de {total_turns} para {len(compacted_turns)} turnos (~{estimated_tokens_saved} tokens poupados).",
        )

        return compacted_turns, stats

    def compact_session_db(
        self,
        db_manager: Any,
        session_id: str,
        project_id: str | None = None,
        owner_user_id: str | None = None,
        keep_recent: int | None = None,
    ) -> CompactionStats:
        """Compacta mensagens persistidas no banco SQLite substituindo blocos antigos por resumo."""
        if db_manager is None:
            raise ValueError("db_manager é obrigatório para compactação de sessão.")

        cutoff = self.keep_recent if keep_recent is None else max(2, keep_recent)

        raw_messages = db_manager.list_chat_messages(
            session_id, limit=200, ascending=True, owner_user_id=owner_user_id
        )

        if len(raw_messages) <= (cutoff + 1):
            return CompactionStats(
                original_turns=len(raw_messages),
                compacted_turns=len(raw_messages),
                original_chars=sum(len(m.get("content") or "") for m in raw_messages),
                compacted_chars=sum(len(m.get("content") or "") for m in raw_messages),
                estimated_tokens_saved=0,
                summary="Histórico já está compacto (poucos turnos para compactar).",
            )

        turns: list[ChatTurn] = []
        for m in raw_messages:
            turns.append(
                ChatTurn(
                    role=m.get("role", "user"),
                    content=m.get("content") or "",
                    tool_call_id=m.get("tool_call_id"),
                    tool_name=m.get("tool_name"),
                )
            )

        compacted_turns, stats = self.compact_turns(turns, keep_recent=cutoff)

        # Deleta histórico anterior e grava novo bloco compactado seguido dos recentes
        db_manager.clear_session_messages(session_id, owner_user_id=owner_user_id)

        for turn in compacted_turns:
            try:
                db_manager.add_chat_message(
                    session_id=session_id,
                    role=turn.role,
                    content=turn.content,
                    project_id=project_id,
                    tool_calls=[c.model_dump() for c in turn.tool_calls]
                    if turn.tool_calls
                    else None,
                    tool_call_id=turn.tool_call_id,
                    tool_name=turn.tool_name,
                    owner_user_id=owner_user_id,
                )
            except PermissionError:
                db_manager.add_chat_message(
                    session_id=session_id,
                    role=turn.role,
                    content=turn.content,
                    project_id=None,
                    tool_calls=[c.model_dump() for c in turn.tool_calls]
                    if turn.tool_calls
                    else None,
                    tool_call_id=turn.tool_call_id,
                    tool_name=turn.tool_name,
                    owner_user_id=owner_user_id,
                )

        logger.info(
            "Sessão '%s' compactada com sucesso: %d -> %d turnos (~%d tokens poupados)",
            session_id,
            stats.original_turns,
            stats.compacted_turns,
            stats.estimated_tokens_saved,
        )

        return stats
