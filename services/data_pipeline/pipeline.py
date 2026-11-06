import csv
import json
import sqlite3
from pathlib import Path
from typing import Any

from .types import DataQualityReport, QualityRule
from .validator import DataQualityValidator


class DataPipelineRunner:
    """
    Executor central de pipelines analíticas e ETL do JARVIS AI HUB.
    Suporta ingestão de CSV, JSON e SQLite, limpeza de dados e geração de datasets higienizados.
    """

    def __init__(self, validator: DataQualityValidator | None = None):
        self.validator = validator or DataQualityValidator()

    def load_csv(self, file_path: Path | str) -> list[dict[str, Any]]:
        path = Path(file_path)
        if not path.exists():
            raise FileNotFoundError(f"Arquivo CSV não encontrado: {path}")

        records: list[dict[str, Any]] = []
        with open(path, encoding="utf-8") as f:
            reader = csv.DictReader(f)
            for row in reader:
                # Converte tipos numéricos óbvios
                converted: dict[str, Any] = {}
                for k, v in row.items():
                    if v is None or v == "":
                        converted[k] = None
                    else:
                        try:
                            if "." in v:
                                converted[k] = float(v)
                            else:
                                converted[k] = int(v)
                        except ValueError:
                            converted[k] = v
                records.append(converted)
        return records

    def load_json(self, file_path: Path | str) -> list[dict[str, Any]]:
        path = Path(file_path)
        if not path.exists():
            raise FileNotFoundError(f"Arquivo JSON não encontrado: {path}")

        with open(path, encoding="utf-8") as f:
            data = json.load(f)
            if isinstance(data, list):
                return data
            elif isinstance(data, dict):
                return [data]
            else:
                raise TypeError("JSON deve conter uma lista ou objeto de registros.")

    def load_sqlite_query(self, db_path: Path | str, query: str) -> list[dict[str, Any]]:
        conn = sqlite3.connect(str(db_path))
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()
        try:
            cursor.execute(query)
            rows = cursor.fetchall()
            return [dict(row) for row in rows]
        finally:
            conn.close()

    def process_and_clean(
        self,
        records: list[dict[str, Any]],
        rules: list[QualityRule] | None = None,
        drop_duplicates: bool = True,
        fill_nulls: dict[str, Any] | None = None,
    ) -> tuple[list[dict[str, Any]], DataQualityReport]:
        """
        Executa limpeza de dados, preenchimento de nulos e validação de schema.
        """
        cleaned: list[dict[str, Any]] = []
        seen = set()

        for row in records:
            # Preenchimento de nulos
            new_row = dict(row)
            if fill_nulls:
                for col, default_val in fill_nulls.items():
                    if new_row.get(col) is None or new_row.get(col) == "":
                        new_row[col] = default_val

            if drop_duplicates:
                row_repr = tuple(sorted((k, str(v)) for k, v in new_row.items()))
                if row_repr in seen:
                    continue
                seen.add(row_repr)

            cleaned.append(new_row)

        report = self.validator.validate_records(cleaned, rules=rules)
        return cleaned, report
