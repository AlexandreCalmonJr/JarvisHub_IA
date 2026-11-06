import os
from pathlib import Path

from pydantic import BaseModel, Field

DEFAULT_EXCLUDED_DIRS: set[str] = {
    ".git",
    ".idea",
    ".vscode",
    "node_modules",
    "build",
    "dist",
    ".dart_tool",
    ".venv",
    "venv",
    "__pycache__",
    ".gradle",
    ".cache",
}

DEFAULT_EXCLUDED_FILES: set[str] = {
    ".DS_Store",
    "Thumbs.db",
    "desktop.ini",
}

BINARY_EXTENSIONS: set[str] = {
    ".png",
    ".jpg",
    ".jpeg",
    ".gif",
    ".ico",
    ".pdf",
    ".exe",
    ".dll",
    ".so",
    ".dylib",
    ".apk",
    ".aab",
    ".zip",
    ".tar",
    ".gz",
    ".7z",
    ".bin",
    ".pyc",
}


class FileInfo(BaseModel):
    relative_path: str
    size_bytes: int
    extension: str
    is_binary: bool = False
    is_manifest: bool = False


class ProjectInventory(BaseModel):
    project_id: str
    root_path: str
    total_files: int = 0
    total_size_bytes: int = 0
    languages: dict[str, int] = Field(default_factory=dict)
    manifests_found: list[str] = Field(default_factory=list)
    files: list[FileInfo] = Field(default_factory=list)


class ProjectScanner:
    """
    Scanner estritamente de leitura (read-only) para projetos existentes.
    Aplica limites de profundidade, tamanho de arquivo e listas de exclusão.
    """

    def __init__(
        self,
        max_files: int = 2000,
        max_depth: int = 8,
        max_file_size_bytes: int = 2 * 1024 * 1024,  # 2MB
    ):
        self.max_files = max_files
        self.max_depth = max_depth
        self.max_file_size_bytes = max_file_size_bytes

    def scan(self, project_id: str, root_path: Path) -> ProjectInventory:
        resolved_root = Path(root_path).resolve()
        if not resolved_root.exists() or not resolved_root.is_dir():
            raise ValueError(f"Diretório '{root_path}' não encontrado ou inválido.")

        inventory = ProjectInventory(
            project_id=project_id,
            root_path=str(resolved_root),
        )

        for root, dirs, files in os.walk(resolved_root):
            # 1. Filtra diretórios excluídos in-place
            dirs[:] = [d for d in dirs if d not in DEFAULT_EXCLUDED_DIRS]

            # 2. Verifica limite de profundidade
            rel_dir = Path(root).relative_to(resolved_root)
            if len(rel_dir.parts) > self.max_depth:
                dirs.clear()
                continue

            for filename in files:
                if filename in DEFAULT_EXCLUDED_FILES or filename.startswith(".env"):
                    continue

                if inventory.total_files >= self.max_files:
                    break

                file_path = Path(root) / filename
                rel_path = file_path.relative_to(resolved_root).as_posix()
                ext = file_path.suffix.lower()

                # Verifica tamanho
                try:
                    size = file_path.stat().st_size
                except OSError:
                    continue

                if size > self.max_file_size_bytes:
                    continue

                is_bin = ext in BINARY_EXTENSIONS
                is_manifest = filename in (
                    "pubspec.yaml",
                    "package.json",
                    "pyproject.toml",
                    "requirements.txt",
                    "pom.xml",
                    "build.gradle",
                ) or filename.endswith(".csproj")

                info = FileInfo(
                    relative_path=rel_path,
                    size_bytes=size,
                    extension=ext or "sem_extensao",
                    is_binary=is_bin,
                    is_manifest=is_manifest,
                )

                inventory.files.append(info)
                inventory.total_files += 1
                inventory.total_size_bytes += size
                inventory.languages[ext] = inventory.languages.get(ext, 0) + 1

                if is_manifest:
                    inventory.manifests_found.append(rel_path)

        return inventory
