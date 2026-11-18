import sqlite3
from pathlib import Path

from .database import DatabaseManager


class DatabaseBackupManager:
    """
    Fachada de compatibilidade para backup/restore do armazenamento SQLite legado.
    Utiliza a API de backup nativo do SQLite (VACUUM INTO ou connection.backup) para evitar corrupção.
    """

    @staticmethod
    def backup_database(db_manager: DatabaseManager, output_dir: Path) -> Path:
        # Delegates connection ownership to DatabaseManager. The caller no longer
        # reaches into its private SQLite connection implementation.
        return Path(
            db_manager.create_database_backup(
                output_dir, filename_prefix="jarvis_db_backup", extension=".sqlite"
            )
        )

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
