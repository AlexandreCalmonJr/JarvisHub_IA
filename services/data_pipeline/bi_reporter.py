from typing import Any

from services.security_core import redact_data

from .types import DataQualityReport


class BIReportGenerator:
    """
    Gerador de relatórios analíticos de Business Intelligence (BI).
    Produz saídas em Markdown e HTML com resumos estatísticos, KPIs e redação de segurança.
    """

    def generate_markdown_report(
        self,
        title: str,
        records: list[dict[str, Any]],
        quality_report: DataQualityReport,
        kpi_metrics: dict[str, Any] | None = None,
    ) -> str:
        safe_records = redact_data(records[:5])  # Amostra segura para exibição
        safe_kpis = redact_data(kpi_metrics or {})

        lines = [
            f"# Relatório Analítico de BI: {title}",
            "",
            "## 1. Visão Geral do Conjunto de Dados",
            f"- **Total de Registos**: {quality_report.total_rows}",
            f"- **Colunas Analisadas**: {quality_report.total_columns}",
            f"- **Linhas Duplicadas Removidas/Detetadas**: {quality_report.duplicate_rows}",
            f"- **Conformidade de Schema**: {'Aprovado (Válido)' if quality_report.is_valid else 'Requer Atenção'}",
            "",
            "## 2. Indicadores-Chave de Desempenho (KPIs)",
        ]

        if safe_kpis:
            for k, v in safe_kpis.items():
                lines.append(f"- **{k}**: {v}")
        else:
            lines.append("- *Nenhum KPI customizado informado.*")

        lines.extend(
            [
                "",
                "## 3. Resumo Estatístico de Variáveis Numéricas",
            ]
        )

        if quality_report.summary_stats:
            lines.append("| Variável | Registos | Mínimo | Máximo | Média |")
            lines.append("| :--- | :--- | :--- | :--- | :--- |")
            for var, stats in quality_report.summary_stats.items():
                lines.append(
                    f"| {var} | {stats['count']} | {stats['min']} | {stats['max']} | {stats['avg']} |"
                )
        else:
            lines.append("- *Nenhuma variável numérica identificada.*")

        lines.extend(
            [
                "",
                "## 4. Amostra Higienizada de Dados",
                "```json",
                f"{safe_records}",
                "```",
                "",
                "---",
                "*Gerado automaticamente pelo Agente BI Analyst do JARVIS AI HUB.*",
            ]
        )

        return "\n".join(lines)

    def generate_html_report(
        self,
        title: str,
        records: list[dict[str, Any]],
        quality_report: DataQualityReport,
        kpi_metrics: dict[str, Any] | None = None,
    ) -> str:
        md = self.generate_markdown_report(title, records, quality_report, kpi_metrics)
        # HTML estilizado e limpo
        return f"""<!DOCTYPE html>
<html lang="pt">
<head>
    <meta charset="UTF-8">
    <title>{title}</title>
    <style>
        body {{ font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background: #0f172a; color: #f8fafc; padding: 2rem; max-width: 900px; margin: 0 auto; }}
        h1 {{ color: #38bdf8; border-bottom: 2px solid #334155; padding-bottom: 0.5rem; }}
        h2 {{ color: #818cf8; margin-top: 1.5rem; }}
        table {{ width: 100%; border-collapse: collapse; margin-top: 1rem; }}
        th, td {{ padding: 8px 12px; border: 1px solid #334155; text-align: left; }}
        th {{ background: #1e293b; color: #38bdf8; }}
        pre {{ background: #1e293b; padding: 1rem; border-radius: 8px; overflow-x: auto; }}
    </style>
</head>
<body>
    <pre>{md}</pre>
</body>
</html>"""
