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
        return DatabaseManager.restore_database_backup(snapshot_file, target_db_path)
