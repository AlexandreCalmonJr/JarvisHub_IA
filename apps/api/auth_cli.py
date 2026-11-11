"""CLI de custódia de credenciais do JARVIS AI HUB.

Nenhum segredo é impresso em stdout. Os tokens são entregues exclusivamente
através de arquivos com permissões restritas (0600/ACL do utilizador atual).

Uso:
    python -m apps.api.auth_cli status
    python -m apps.api.auth_cli rotate-admin
    python -m apps.api.auth_cli bootstrap [--ttl 600]
"""

from __future__ import annotations

import argparse
import sys

from apps.api.auth import auth_service


def _cmd_status(_: argparse.Namespace) -> int:
    print(f"Credencial admin configurada: {auth_service.admin_store.has_credential}")
    print(f"Contas humanas: {len(auth_service.user_store.list_users())}")
    print(f"Arquivo do token admin: {auth_service.admin_token_path}")
    print(f"Arquivo do bootstrap token: {auth_service.bootstrap_token_path}")
    return 0


def _cmd_rotate_admin(_: argparse.Namespace) -> int:
    path = auth_service.rotate_admin_token()
    print(f"Novo token admin gravado em arquivo restrito: {path}")
    print("O token anterior foi invalidado. Atualize o launcher/dashboard.")
    return 0


def _cmd_bootstrap(args: argparse.Namespace) -> int:
    token = auth_service.issue_bootstrap_token(ttl_seconds=args.ttl, persist=True)
    assert token
    print(f"Bootstrap token de uso único gravado em: {auth_service.bootstrap_token_path}")
    print(f"Validade: {args.ttl or 600}s. O arquivo será sobrescrito na próxima emissão.")
    return 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="jarvis-auth", description=__doc__)
    sub = parser.add_subparsers(dest="command", required=True)

    status = sub.add_parser("status", help="Mostra o estado da custódia de credenciais.")
    status.set_defaults(func=_cmd_status)

    rotate = sub.add_parser("rotate-admin", help="Gera e grava um novo token admin.")
    rotate.set_defaults(func=_cmd_rotate_admin)

    bootstrap = sub.add_parser("bootstrap", help="Emite um bootstrap token de uso único.")
    bootstrap.add_argument("--ttl", type=int, default=600, help="Validade em segundos.")
    bootstrap.set_defaults(func=_cmd_bootstrap)
    return parser


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    return int(args.func(args))


if __name__ == "__main__":
    sys.exit(main())
