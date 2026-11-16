"""Verificação de inicialização limpa (Clean Install / Bootstrap Verification).

Valida que o JARVIS AI HUB é capaz de inicializar do zero num diretório vazio
sem depender de artefatos prévios, bases de dados pré-existentes ou segredos locais.
"""

from __future__ import annotations

import json
import os
import shutil
import sqlite3
import sys
import tempfile
import time
from datetime import UTC, datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))


def run_clean_install_verification() -> dict:
    temp_dir = Path(tempfile.mkdtemp(prefix="jarvis_clean_install_"))
    data_dir = temp_dir / "data"
    workspace_dir = temp_dir / "workspace"

    start_time = time.perf_counter()
    report = {
        "timestamp": datetime.now(UTC).isoformat(),
        "temp_root": str(temp_dir),
        "steps": [],
        "success": False,
    }

    try:
        # 1. Configurar variáveis de ambiente isoladas
        os.environ["JARVIS_DATA_DIR"] = str(data_dir)
        os.environ["JARVIS_WORKSPACE_DIR"] = str(workspace_dir)
        os.environ["JARVIS_ENVIRONMENT"] = "test"
        report["steps"].append({"step": "env_isolation", "status": "ok"})

        # 2. Inicializar DatabaseManager em diretório limpo
        from services.memory.database import DatabaseManager

        db_path = data_dir / "jarvis.db"
        db = DatabaseManager(db_path=str(db_path))
        report["steps"].append(
            {
                "step": "database_init",
                "status": "ok",
                "db_created": db_path.exists(),
                "db_size": db_path.stat().st_size if db_path.exists() else 0,
            }
        )

        # 3. Validar integridade e schemas criados
        with sqlite3.connect(str(db_path)) as conn:
            integrity = [r[0] for r in conn.execute("PRAGMA integrity_check").fetchall()]
            tables = [
                r[0]
                for r in conn.execute(
                    "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
                ).fetchall()
            ]

        assert integrity == ["ok"], f"Integrity check falhou: {integrity}"
        assert len(tables) >= 10, f"Poucas tabelas geradas: {len(tables)}"
        report["steps"].append(
            {
                "step": "schema_verification",
                "status": "ok",
                "integrity": integrity,
                "table_count": len(tables),
                "tables": tables,
            }
        )

        # 4. Inicializar AuthService e verificar criação da conta admin
        from apps.api.auth import AuthService
        from services.security_core import SecurityCore

        sec = SecurityCore(auth_dir=data_dir / "auth")
        auth = AuthService(security=sec, auth_dir=data_dir / "auth")
        admin = auth.user_store.get_user("admin")
        assert admin is not None, (
            "Administrador padrão não foi criado automaticamente no bootstrap!"
        )
        assert admin.get("role") == "admin", "Role do usuário bootstrap não é admin!"
        assert admin.get("is_active") == 1, "Usuário admin bootstrap deve estar ativo!"

        # Testa autenticação com a credencial inicial de homologação
        auth_result = auth.user_store.authenticate("admin", "jarvishub")
        assert auth_result is not None, "Autenticação do admin bootstrap falhou!"

        report["steps"].append(
            {
                "step": "auth_bootstrap",
                "status": "ok",
                "admin_created": True,
                "admin_role": admin.get("role"),
                "admin_authenticated": True,
            }
        )

        # 5. Inicializar ProjectWorkspaceService em diretório limpo
        from services.project_workspace.workspace_service import ProjectWorkspaceService

        ws = ProjectWorkspaceService(security_core=sec, base_dir=workspace_dir)
        projects = db.list_projects(owner_user_id=admin.get("username", "admin"))
        report["steps"].append(
            {
                "step": "workspace_bootstrap",
                "status": "ok",
                "workspace_created": workspace_dir.exists(),
                "initial_projects": len(projects),
            }
        )

        report["success"] = True

    except Exception as exc:
        report["error"] = str(exc)
        report["success"] = False
    finally:
        report["duration_ms"] = round((time.perf_counter() - start_time) * 1000.0, 2)
        try:
            shutil.rmtree(temp_dir, ignore_errors=True)
        except OSError:
            pass

    return report


if __name__ == "__main__":
    result = run_clean_install_verification()
    output_path = ROOT / "data" / "clean_install_verification.json"
    output_path.write_text(json.dumps(result, indent=2, ensure_ascii=False), encoding="utf-8")
    print("Resultado da Verificação de Instalação Limpa:")
    print(f"Sucesso: {result['success']}")
    print(f"Duração: {result['duration_ms']} ms")
    for step in result["steps"]:
        print(f" - [{step['status'].upper()}] {step['step']}")
    if not result["success"]:
        print(f"Erro: {result.get('error')}")
        sys.exit(1)
