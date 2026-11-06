import sqlite3
from datetime import UTC, datetime
from pathlib import Path

from .database import DatabaseManager


class DatabaseBackupManager:
    """
    Gestor de backup consistente e restauração da base de dados SQLite.
    Utiliza a API de backup nativo do SQLite (VACUUM INTO ou connection.backup) para evitar corrupção.
    """

    @staticmethod
    def backup_database(db_manager: DatabaseManager, output_dir: Path) -> Path:
        output_dir.mkdir(parents=True, exist_ok=True)
        timestamp = datetime.now(UTC).strftime("%Y%m%d_%H%M%S")
        backup_file = output_dir / f"jarvis_db_backup_{timestamp}.sqlite"

        # Conexão de origem e destino utilizando a API nativa de backup atômico
        src_conn = db_manager._get_connection()
        dest_conn = sqlite3.connect(str(backup_file))
        try:
            src_conn.backup(dest_conn)
        finally:
            dest_conn.close()
            src_conn.close()

        return backup_file

    @staticmethod
    def restore_database(snapshot_file: Path, target_db_path: Path) -> DatabaseManager:
        if not snapshot_file.exists():
            raise FileNotFoundError(f"Arquivo de snapshot '{snapshot_file}' não encontrado.")

        target_db_path.parent.mkdir(parents=True, exist_ok=True)

        src_conn = sqlite3.connect(str(snapshot_file))
        dest_conn = sqlite3.connect(str(target_db_path))
        try:
            src_conn.backup(dest_conn)
        finally:
            dest_conn.close()
            src_conn.close()

        return DatabaseManager(db_path=str(target_db_path))
