"""
JARVIS AI HUB - Inteligência de Engenharia & Métricas Executivas
Recursos:
- Análise de Dívida Técnica, LOC e Complexidade Ciclomática
- Métricas de Produtividade e Cálculo de ROI em Dólares economizados via Inferência Local
- Gerador de Relatório Executivo Estruturado (Markdown / HTML)
"""

import logging
import re
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

logger = logging.getLogger("jarvis.engineering_intelligence")


class EngineeringIntelligenceService:
    def __init__(self, workspace_service: Any = None, db_manager: Any = None):
        self.workspace_service = workspace_service
        self.db = db_manager

    def analyze_technical_debt(self, project_dir: Path) -> dict[str, Any]:
        """Calcula métricas de código, densidade de comentários, arquivos extensos e nota de saúde."""
        p_dir = Path(project_dir).resolve()
        if not p_dir.exists():
            raise FileNotFoundError(f"Diretório não encontrado: {p_dir}")

        supported_exts = {".py", ".js", ".jsx", ".ts", ".tsx", ".html", ".css", ".sql"}
        ignored_dirs = {"node_modules", ".git", ".venv", "venv", "__pycache__", "dist", "build"}

        total_files = 0
        total_loc = 0
        total_comments = 0
        total_blank = 0
        large_files = []
        complex_functions = []

        for f in p_dir.rglob("*"):
            if not f.is_file() or f.is_symlink() or f.suffix.lower() not in supported_exts:
                continue
            if any(part in ignored_dirs for part in f.parts):
                continue
            try:
                f.resolve().relative_to(p_dir)
            except (OSError, ValueError):
                continue

            total_files += 1
            rel_path = f.relative_to(p_dir).as_posix()
            try:
                lines = f.read_text(encoding="utf-8", errors="replace").splitlines()
            except Exception:
                logger.debug(
                    "Ficheiro ilegível ignorado na análise de dívida técnica: %s",
                    rel_path,
                    exc_info=True,
                )
                continue

            file_loc = len(lines)
            total_loc += file_loc
            if file_loc > 400:
                large_files.append({"file": rel_path, "lines": file_loc})

            current_func = None
            func_line_count = 0

            for idx, line in enumerate(lines, start=1):
                stripped = line.strip()
                if not stripped:
                    total_blank += 1
                    continue
                if stripped.startswith(("#", "//", "/*", "*")):
                    total_comments += 1
                    continue

                # Detecção de início de função em Python ou JS/TS
                func_match = re.match(
                    r"^\s*(?:def|async def|function|const\s+\w+\s*=\s*(?:async\s*)?\([^)]*\)\s*=>)\s*([a-zA-Z0-9_]+)",
                    line,
                )
                if func_match:
                    if current_func and func_line_count > 60:
                        complex_functions.append(
                            {
                                "file": rel_path,
                                "function": current_func,
                                "lines": func_line_count,
                            }
                        )
                    current_func = func_match.group(1)
                    func_line_count = 0
                elif current_func:
                    func_line_count += 1

            if current_func and func_line_count > 60:
                complex_functions.append(
                    {
                        "file": rel_path,
                        "function": current_func,
                        "lines": func_line_count,
                    }
                )

        comment_ratio = round((total_comments / max(1, total_loc)) * 100, 1)

        # Cálculo do Índice de Manutenibilidade (0 a 100)
        penalty = len(large_files) * 8 + len(complex_functions) * 5
        maintainability_score = max(20, min(100, 100 - penalty))

        grade = (
            "A (Excelente)"
            if maintainability_score >= 85
            else "B (Bom)"
            if maintainability_score >= 70
            else "C (Atenção / Refatorar)"
            if maintainability_score >= 50
            else "D (Crítico)"
        )

        return {
            "status": "completed",
            "score": maintainability_score,
            "grade": grade,
            "metrics": {
                "total_files": total_files,
                "total_lines_of_code": total_loc,
                "comment_lines": total_comments,
                "blank_lines": total_blank,
                "comment_ratio_percent": comment_ratio,
            },
            "god_files_count": len(large_files),
            "god_files": large_files[:10],
            "complex_functions_count": len(complex_functions),
            "complex_functions": complex_functions[:10],
            "recommendations": [
                f"Dividir {len(large_files)} arquivos com mais de 400 linhas em módulos menores."
                if large_files
                else "Tamanho de arquivos equilibrado.",
                f"Refatorar {len(complex_functions)} funções que excedem 60 linhas para favorecer princípio da responsabilidade única."
                if complex_functions
                else "Funções concisas e de alta legibilidade.",
                f"Taxa de comentários em {comment_ratio}%. Ideal entre 10% e 25%.",
            ],
        }

    def calculate_productivity_and_roi(self, owner_user_id: str | None = None) -> dict[str, Any]:
        """Calcula horas economizadas e dólares poupados com inferência local sem nuvem."""
        total_tasks = 0
        if self.db:
            tasks = self.db.list_tasks(limit=100, owner_user_id=owner_user_id)
            total_tasks = sum(1 for task in tasks if task.get("is_completed"))

        # Estimativa de tokens processados localmente (ex: ~4.000 tokens por tarefa de engenharia)
        estimated_tokens = total_tasks * 4500

        # Custo equivalente na Nuvem (Taxa média: $10.00 / 1 milhão de tokens)
        cost_saved_usd = round((estimated_tokens / 1_000_000.0) * 10.0, 2)
        # Horas de engenharia economizadas (média: 25 min = 0.41h por tarefa automatizada)
        hours_saved = round(total_tasks * 0.42, 1)

        return {
            "total_tasks_completed": total_tasks,
            "estimated_local_tokens": estimated_tokens,
            "cost_saved_usd": cost_saved_usd,
            "cost_saved_brl": round(cost_saved_usd * 5.80, 2),
            "engineering_hours_saved": hours_saved,
            "cloud_lockin": "Não calculado",
        }

    def generate_executive_report(
        self, project_id: str | None = None, owner_user_id: str | None = None
    ) -> dict[str, Any]:
        """Gera relatório executivo global (admin) ou limitado à conta/projeto."""
        if project_id and not owner_user_id:
            raise PermissionError("A conta proprietária é obrigatória para relatórios de projeto.")
        roi = self.calculate_productivity_and_roi(owner_user_id=owner_user_id)
        now = datetime.now(UTC).strftime("%d/%m/%Y %H:%M UTC")

        proj_name = project_id or "Ecossistema Geral"
        debt = None
        if project_id and self.workspace_service:
            p_dir = self.workspace_service.get_project_dir(project_id)
            debt = self.analyze_technical_debt(p_dir)

        md_lines = [
            "# 📊 JARVIS AI HUB — Relatório Executivo de Engenharia",
            f"**Data de Emissão:** {now} | **Projeto:** {proj_name}",
            "",
            "## 1. Sumário Executivo de Produtividade & ROI",
            f"- **Tarefas Concluídas na Conta:** {roi['total_tasks_completed']}",
            f"- **Tempo potencialmente poupado (estimativa):** {roi['engineering_hours_saved']} horas (0,42h por tarefa)",
            f"- **Economia estimada em APIs de Nuvem:** US$ {roi['cost_saved_usd']} (~R$ {roi['cost_saved_brl']}) — 4.500 tokens/tarefa a US$ 10 por milhão",
            f"- **Escopo dos dados:** {'Conta proprietária do projeto' if project_id else 'Relatório global administrativo'}",
            "",
            "## 2. Indicadores de Qualidade e Saúde do Código",
        ]

        if debt:
            md_lines.extend(
                [
                    f"- **Nota de Saúde Arquitetural:** {debt['grade']} ({debt['score']}/100)",
                    f"- **Linhas Totais de Código (LOC):** {debt['metrics']['total_lines_of_code']}",
                    f"- **Total de Arquivos Analisados:** {debt['metrics']['total_files']}",
                    f"- **Densidade de Comentários:** {debt['metrics']['comment_ratio_percent']}%",
                    "",
                    "### Recomendações Estratégicas:",
                ]
            )
            for r in debt["recommendations"]:
                md_lines.append(f"- {r}")
        else:
            md_lines.append(
                "- *Análise detalhada de código disponível ao selecionar um projeto específico.*"
            )

        md_lines.extend(
            [
                "",
                "## 3. Conformidade & Segurança Cibernética",
                "- **Controles de segurança:** consultar o Security Center para o estado operacional atual",
                "",
                "---",
                "*Gerado automaticamente pelo JARVIS AI Hub Intelligence Core.*",
            ]
        )

        markdown_content = "\n".join(md_lines)
        return {
            "status": "generated",
            "project": proj_name,
            "generated_at": now,
            "roi": roi,
            "technical_debt": debt,
            "markdown": markdown_content,
        }
