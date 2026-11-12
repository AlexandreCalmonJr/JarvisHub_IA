"""
Mecanismo de Auto-Correção Sintática (Self-Correction Loop).
Valida e repara sintaxe de código gerado (Python, JSON, HTML, etc.)
antes da entrega final ao usuário.
"""

import ast
import json
import logging
import re

logger = logging.getLogger("jarvis.orchestration.self_correction")


class SelfCorrectionEngine:
    """Motor interno de análise sintática e autocorreção de código."""

    @classmethod
    def heal_python_code(cls, code: str) -> tuple[str, bool, str | None]:
        """
        Valida e tenta corrigir erros sintáticos comuns em código Python gerado por LLMs.
        Retorna: (código_corrigido, foi_alterado, mensagem_de_erro_ou_sucesso)
        """
        # 1. Verifica se compila originalmente
        try:
            ast.parse(code)
            return code, False, None
        except SyntaxError as orig_err:
            logger.info(
                "Detectado erro sintático em Python na linha %s: %s", orig_err.lineno, orig_err.msg
            )

        healed_code = code
        modified = False

        # Correção 1: Normalização de indentação (substitui tabs por 4 espaços)
        if "\t" in healed_code:
            healed_code = healed_code.replace("\t", "    ")
            modified = True

        # Correção 2: Adiciona dois-pontos ':' ausentes no final de blocos
        block_keywords = (
            "def ",
            "class ",
            "if ",
            "elif ",
            "else:",
            "while ",
            "for ",
            "try:",
            "except",
            "finally:",
            "with ",
            "async def ",
            "async with ",
            "async for ",
        )
        lines = healed_code.split("\n")
        new_lines = []
        for line in lines:
            stripped = line.strip()
            # Se inicia com palavra-chave de bloco e não termina em ':' ou '\' ou comentário
            if (
                any(
                    stripped.startswith(kw)
                    for kw in (
                        "def ",
                        "class ",
                        "if ",
                        "elif ",
                        "while ",
                        "for ",
                        "with ",
                        "async def ",
                    )
                )
                and not stripped.endswith(":")
                and not stripped.endswith("\\")
            ):
                # Ignora se for expressão lambda ou inline
                if not ("lambda" in stripped and not stripped.endswith(":")):
                    line = line.rstrip() + ":"
                    modified = True
            elif stripped in ("else", "try", "finally") and not stripped.endswith(":"):
                line = line.rstrip() + ":"
                modified = True
            new_lines.append(line)
        healed_code = "\n".join(new_lines)

        # Correção 3: Fecha parênteses, colchetes ou chaves não balanceadas
        open_parens = healed_code.count("(") - healed_code.count(")")
        open_brackets = healed_code.count("[") - healed_code.count("]")
        open_braces = healed_code.count("{") - healed_code.count("}")

        if open_parens > 0:
            healed_code += ")" * open_parens
            modified = True
        if open_brackets > 0:
            healed_code += "]" * open_brackets
            modified = True
        if open_braces > 0:
            healed_code += "}" * open_braces
            modified = True

        # Testa se a autocorreção resolveu
        try:
            ast.parse(healed_code)
            return (
                healed_code,
                True,
                "Erro de sintaxe corrigido com sucesso (dois-pontos ou delimitadores balanceados)",
            )
        except SyntaxError:
            # Se não conseguiu corrigir tudo com heurísticas simples, retorna o código original
            return code, False, "Erro de sintaxe residual detectado"

    @classmethod
    def heal_json_code(cls, code: str) -> tuple[str, bool, str | None]:
        """Valida e repara JSON com trailing commas ou aspas simples."""
        try:
            json.loads(code)
            return code, False, None
        except Exception:
            logger.debug("JSON inválido; a tentar reparação heurística.", exc_info=True)

        cleaned = code.strip()
        # Remove vírgulas finais antes de fechar objeto ou array
        cleaned = re.sub(r",\s*([}\]])", r"\1", cleaned)

        # Substitui aspas simples por duplas em chaves
        cleaned = re.sub(r"\'([a-zA-Z0-9_-]+)\'\s*:", r'"\1":', cleaned)

        try:
            json.loads(cleaned)
            return (
                cleaned,
                True,
                "JSON reparado (remoção de vírgulas trailing / normalização de aspas)",
            )
        except Exception:
            return code, False, "JSON inválido"

    @classmethod
    def heal_markdown_text(cls, text: str) -> tuple[str, list[str]]:
        """
        Varre todos os blocos de código em markdown (```python ... ``` ou ```json ... ```)
        e aplica a autocorreção sintática em cada um.
        """
        corrections: list[str] = []

        def replace_python_block(match: re.Match) -> str:
            lang = match.group(1) or ""
            code = match.group(2)
            healed, was_modified, msg = cls.heal_python_code(code)
            if was_modified:
                corrections.append(f"Código Python corrigido: {msg}")
                return f"```{lang}\n{healed}\n```"
            return match.group(0)

        def replace_json_block(match: re.Match) -> str:
            code = match.group(1)
            healed, was_modified, msg = cls.heal_json_code(code)
            if was_modified:
                corrections.append(f"Estrutura JSON reparada: {msg}")
                return f"```json\n{healed}\n```"
            return match.group(0)

        # Trata blocos Python
        updated_text = re.sub(
            r"```(python|py)\n([\s\S]*?)\n```",
            replace_python_block,
            text,
        )

        # Trata blocos JSON
        updated_text = re.sub(
            r"```(?:json)\n([\s\S]*?)\n```",
            replace_json_block,
            updated_text,
        )

        if corrections:
            badge = (
                "\n\n> ⚡ **Self-Correction Ativo**: "
                + " • ".join(corrections)
                + " (compilador interno do JARVIS validou a integridade sintática)."
            )
            updated_text += badge

        return updated_text, corrections
