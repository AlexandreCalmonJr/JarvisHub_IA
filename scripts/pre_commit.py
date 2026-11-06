"""
Pre-commit hook automatizado para validação de qualidade e segurança do JARVIS AI HUB.
Executa ruff check e pytest antes de permitir a criação de commits no Git.
"""

import subprocess
import sys


def run_check(cmd: list[str], desc: str) -> bool:
    print(f"[PRE-COMMIT] Executando: {desc}...")
    res = subprocess.run(cmd)
    if res.returncode != 0:
        print(f"[PRE-COMMIT] FALHA em {desc} (código {res.returncode}).")
        return False
    print(f"[PRE-COMMIT] {desc} passou com sucesso.")
    return True


def main():
    venv_py = sys.executable

    # 1. Ruff linting
    ruff_ok = run_check([venv_py, "-m", "ruff", "check", "."], "Ruff Linter")
    if not ruff_ok:
        sys.exit(1)

    # 2. Pytest suite
    test_ok = run_check([venv_py, "-m", "pytest", "-q"], "Suite Pytest")
    if not test_ok:
        sys.exit(1)

    print("\n[PRE-COMMIT] Todas as verificações de qualidade foram aprovadas!")
    sys.exit(0)


if __name__ == "__main__":
    main()
