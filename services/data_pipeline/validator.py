from typing import Any

from .types import DataQualityReport, QualityRule


class DataQualityValidator:
    """
    Validador de qualidade de conjuntos de dados e schemas para o agente Data Engineer.
    Deteta nulos indesejados, tipos incorretos, linhas duplicadas e violações de limites.
    """

    def validate_records(
        self,
        records: list[dict[str, Any]],
        rules: list[QualityRule] | None = None,
    ) -> DataQualityReport:
        if not records:
            return DataQualityReport(
                is_valid=True,
                total_rows=0,
                total_columns=0,
                null_counts={},
                duplicate_rows=0,
                violations=[],
            )

        total_rows = len(records)
        columns = list(records[0].keys())
        null_counts = {col: 0 for col in columns}
        violations: list[str] = []

        # Detecção de duplicados
        seen_rows = set()
        duplicate_count = 0

        for idx, row in enumerate(records):
            # Serializa representação da linha para hash
            row_repr = tuple(sorted((k, str(v)) for k, v in row.items()))
            if row_repr in seen_rows:
                duplicate_count += 1
            else:
                seen_rows.add(row_repr)

            for col in columns:
                val = row.get(col)
                if val is None or val == "":
                    null_counts[col] += 1

            if rules:
                for rule in rules:
                    val = row.get(rule.column)
                    if val is None:
                        if not rule.allow_null:
                            violations.append(
                                f"Linha {idx}: Coluna '{rule.column}' contém nulo não permitido."
                            )
                        continue

                    # Verificação de tipo
                    if rule.expected_type in ("int", "float", "number"):
                        if not isinstance(val, (int, float)):
                            violations.append(
                                f"Linha {idx}: Coluna '{rule.column}' esperava {rule.expected_type}, obteve {type(val).__name__}."
                            )
                        else:
                            if rule.min_value is not None and val < rule.min_value:
                                violations.append(
                                    f"Linha {idx}: Coluna '{rule.column}' valor {val} abaixo do mínimo {rule.min_value}."
                                )
                            if rule.max_value is not None and val > rule.max_value:
                                violations.append(
                                    f"Linha {idx}: Coluna '{rule.column}' valor {val} acima do máximo {rule.max_value}."
                                )
                    elif rule.expected_type == "str" and not isinstance(val, str):
                        violations.append(
                            f"Linha {idx}: Coluna '{rule.column}' esperava str, obteve {type(val).__name__}."
                        )

        # Estatísticas básicas para colunas numéricas
        stats: dict[str, Any] = {}
        for col in columns:
            numeric_vals = [r[col] for r in records if isinstance(r.get(col), (int, float))]
            if numeric_vals:
                stats[col] = {
                    "count": len(numeric_vals),
                    "min": min(numeric_vals),
                    "max": max(numeric_vals),
                    "avg": round(sum(numeric_vals) / len(numeric_vals), 2),
                }

        is_valid = len(violations) == 0
        return DataQualityReport(
            is_valid=is_valid,
            total_rows=total_rows,
            total_columns=len(columns),
            null_counts=null_counts,
            duplicate_rows=duplicate_count,
            violations=violations,
            summary_stats=stats,
        )
