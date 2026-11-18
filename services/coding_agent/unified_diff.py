"""
Tolerant Unified Diff and Search/Replace Engine for JARVIS AI HUB.
Enables surgical code modifications with whitespace tolerance, hunk verification,
and dry-run capabilities (inspired by Aider & Cursor).
"""

from __future__ import annotations

import difflib
import logging
import re
from dataclasses import dataclass

logger = logging.getLogger("jarvis.coding_agent.unified_diff")


@dataclass
class DiffHunk:
    search_block: str
    replace_block: str
    line_number_hint: int | None = None


@dataclass
class PatchResult:
    success: bool
    modified_content: str
    hunks_applied: int
    hunks_failed: int
    error_message: str | None = None
    unified_diff: str = ""


class TolerantDiffPatcher:
    """
    Applies search/replace blocks or unified diff hunks with whitespace leniency.
    """

    @staticmethod
    def apply_search_replace(
        original: str,
        search_block: str,
        replace_block: str,
        fuzzy: bool = True,
    ) -> PatchResult:
        """
        Replaces search_block with replace_block in original string.
        If fuzzy is True, falls back to normalized whitespace matching if exact match fails.
        """
        # 1. Exact match attempt
        if search_block in original:
            count = original.count(search_block)
            if count == 1:
                new_content = original.replace(search_block, replace_block, 1)
                diff = TolerantDiffPatcher.generate_diff(original, new_content)
                return PatchResult(
                    success=True,
                    modified_content=new_content,
                    hunks_applied=1,
                    hunks_failed=0,
                    unified_diff=diff,
                )
            elif count > 1:
                return PatchResult(
                    success=False,
                    modified_content=original,
                    hunks_applied=0,
                    hunks_failed=1,
                    error_message=f"Ambiguidade: o bloco de busca aparece {count} vezes no arquivo.",
                )

        if not fuzzy:
            return PatchResult(
                success=False,
                modified_content=original,
                hunks_applied=0,
                hunks_failed=1,
                error_message="Bloco de busca não encontrado no arquivo.",
            )

        # 2. Tolerant match (ignoring leading/trailing whitespace per line)
        matched_span = TolerantDiffPatcher._fuzzy_find_span(original, search_block)
        if matched_span:
            start_idx, end_idx = matched_span
            new_content = original[:start_idx] + replace_block + original[end_idx:]
            diff = TolerantDiffPatcher.generate_diff(original, new_content)
            return PatchResult(
                success=True,
                modified_content=new_content,
                hunks_applied=1,
                hunks_failed=0,
                unified_diff=diff,
            )

        return PatchResult(
            success=False,
            modified_content=original,
            hunks_applied=0,
            hunks_failed=1,
            error_message="Bloco de busca não encontrado mesmo com tolerância a espaços em branco.",
        )

    @staticmethod
    def _fuzzy_find_span(text: str, pattern: str) -> tuple[int, int] | None:
        """Finds matching start and end index by comparing normalized lines."""
        text_lines = text.splitlines(keepends=True)
        pattern_lines = [p.strip() for p in pattern.splitlines() if p.strip()]
        if not pattern_lines:
            return None

        for i in range(len(text_lines) - len(pattern_lines) + 1):
            window = [text_lines[i + j].strip() for j in range(len(pattern_lines))]
            if window == pattern_lines:
                start_char = sum(len(text_lines[k]) for k in range(i))
                match_char_len = sum(len(text_lines[i + j]) for j in range(len(pattern_lines)))
                return (start_char, start_char + match_char_len)

        return None

    @staticmethod
    def generate_diff(original: str, modified: str, filename: str = "file") -> str:
        """Generates unified diff representation."""
        orig_lines = original.splitlines(keepends=True)
        mod_lines = modified.splitlines(keepends=True)
        diff_iter = difflib.unified_diff(
            orig_lines,
            mod_lines,
            fromfile=f"a/{filename}",
            tofile=f"b/{filename}",
        )
        return "".join(diff_iter)

    @classmethod
    def parse_search_replace_blocks(cls, raw_text: str) -> list[DiffHunk]:
        """
        Parses <<<<<<< SEARCH ... ======= ... >>>>>>> REPLACE blocks.
        """
        pattern = re.compile(
            r"<<<<<<<\s*SEARCH\s*\n(.*?)\n=======\s*\n(.*?)\n>>>>>>>\s*REPLACE",
            re.DOTALL,
        )
        hunks = []
        for match in pattern.finditer(raw_text):
            hunks.append(DiffHunk(search_block=match.group(1), replace_block=match.group(2)))
        return hunks
