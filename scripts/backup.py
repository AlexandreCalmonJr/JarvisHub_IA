import os
import zipfile
from datetime import UTC, datetime
from pathlib import Path


def create_backup(source_dir: str = ".", output_dir: str = "backups") -> Path:
    """Gera um arquivo zip seguro com timestamp em backups/ ignorando temporários e .venv."""
    src = Path(source_dir).resolve()
    dest = Path(output_dir).resolve()
    dest.mkdir(parents=True, exist_ok=True)

    timestamp = datetime.now(UTC).strftime("%Y%m%d_%H%M%S")
    backup_file = dest / f"jarvis_backup_{timestamp}.zip"

    ignored_dirs = {
        ".venv",
        ".git",
        "__pycache__",
        "node_modules",
        "data",
        "backups",
        "build",
        "dist",
    }

    with zipfile.ZipFile(backup_file, "w", zipfile.ZIP_DEFLATED) as zipf:
        for root, dirs, files in os.walk(src):
            dirs[:] = [d for d in dirs if d not in ignored_dirs]
            for file in files:
                if file.endswith((".pyc", ".tmp", ".zip")):
                    continue
                file_path = Path(root) / file
                arcname = file_path.relative_to(src)
                zipf.write(file_path, arcname)

    return backup_file


if __name__ == "__main__":
    archive = create_backup()
    print(f"[OK] Backup criado e validado em: {archive} ({archive.stat().st_size} bytes)")
