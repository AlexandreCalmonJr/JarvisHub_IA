"""Núcleo de Blindagem Cibernética e Prevenção de Fuga de Dados (Zero-Trust Cyber Shield)."""

import logging
import re
from datetime import datetime
from typing import Any

logger = logging.getLogger("jarvis.security.cyber_shield")

# Padrões aprofundados para prevenção de vazamento de credenciais e chaves
EXPANDED_SECRET_PATTERNS = [
    re.compile(r"hf_[a-zA-Z0-9]{34,}"),  # Hugging Face Personal Access Tokens
    re.compile(r"gsk_[a-zA-Z0-9]{40,}"),  # Groq API Keys
    re.compile(r"AIza[0-9A-Za-z-_]{35}"),  # Google Cloud / Gemini API Keys
    re.compile(r"sk-[a-zA-Z0-9]{20,}"),  # OpenAI Keys
    re.compile(r"ghp_[a-zA-Z0-9]{36}"),  # GitHub PAT
    re.compile(r"(?i)(bearer|authorization)\s+[a-zA-Z0-9_\-\.]{25,}"),  # Bearer tokens genéricos
    re.compile(
        r"-----BEGIN\s+(?:RSA\s+|OPENSSH\s+|EC\s+)?PRIVATE\s+KEY-----[\s\S]*?-----END\s+(?:RSA\s+|OPENSSH\s+|EC\s+)?PRIVATE\s+KEY-----"
    ),  # Chaves privadas SSH/RSA
    re.compile(
        r'(?i)(api[_-]?key|secret|password|passwd|db_pass)\s*[:=]\s*["\']?([^"\'\s,;]{6,})["\']?'
    ),  # Atribuições diretas de senhas
]

CYBER_MASK = "[DADO_CONFIDENCIAL_PROTEGIDO_PELO_JARVIS]"


class CyberShield:
    """Núcleo de defesa cibernética: isolamento localhost estrito, DLP de saída e Kill-Switch de rede."""

    def __init__(self):
        self.network_isolated: bool = False
        self.dlp_inspections: int = 0
        self.secrets_redacted_count: int = 0
        self.blocked_outbound_attempts: int = 0
        self.host_binding: str = "127.0.0.1 (Localhost Restrito)"
        self.inbound_block_active: bool = True
        self.boot_time: str = datetime.now().isoformat()

    def inspect_and_sanitize_outbound(self, content: str) -> tuple[str, bool]:
        """Inspeciona texto antes de enviar para APIs externas (Hugging Face ou Nuvem).

        Se houver segredos, substitui pela máscara segura e registra telemetria.
        """
        self.dlp_inspections += 1
        if not content:
            return content, False

        # Se o modo isolamento offline estrito estiver ativado, bloqueia toda saída externa
        if self.network_isolated:
            self.blocked_outbound_attempts += 1
            logger.warning("Bloqueio de rede ativo: requisição externa abortada pelo CyberShield.")
            raise PermissionError(
                "O JARVIS está em Modo Isolamento de Rede Estrito (Zero Outbound). Acesso à internet desativado."
            )

        sanitized = content
        redacted = False

        for pattern in EXPANDED_SECRET_PATTERNS:
            if pattern.search(sanitized):
                redacted = True
                self.secrets_redacted_count += 1
                if pattern.groups == 2:
                    sanitized = pattern.sub(r"\1: " + CYBER_MASK, sanitized)
                else:
                    sanitized = pattern.sub(CYBER_MASK, sanitized)

        if redacted:
            logger.info(
                "Filtro DLP ativado: segredos confidenciais foram ofuscados antes do envio."
            )

        return sanitized, redacted

    def toggle_network_isolation(
        self, isolated: bool, reason: str = "Configurado pelo usuário"
    ) -> dict[str, Any]:
        """Ativa ou desativa o corte total de conexões de internet do JARVIS."""
        self.network_isolated = isolated
        status_label = (
            "Isolamento Estrito 100% Offline"
            if isolated
            else "Acesso Seguro Autorizado (DLP Ativo)"
        )
        logger.info("Estado de rede atualizado: %s. Motivo: %s", status_label, reason)
        return {
            "network_isolated": self.network_isolated,
            "status": status_label,
            "reason": reason,
            "timestamp": datetime.now().isoformat(),
        }

    def get_security_status(self) -> dict[str, Any]:
        """Retorna o status consolidado de blindagem cibernética do JARVIS."""
        return {
            "inbound_protection": {
                "active": self.inbound_block_active,
                "host_binding": self.host_binding,
                "status_label": "Bloqueio Total de Entrada Externa (Zero Inbound)",
                "description": "Portas do sistema vinculadas exclusivamente ao 127.0.0.1. Nenhum dispositivo na rede local ou Wi-Fi pode acessar o JARVIS.",
            },
            "dlp_shield": {
                "active": True,
                "total_inspections": self.dlp_inspections,
                "secrets_redacted_count": self.secrets_redacted_count,
                "description": "Prevenção Ativa de Fuga de Dados: Toda requisição externa tem senhas, tokens e chaves privadas mascaradas.",
            },
            "network_isolation": {
                "isolated": self.network_isolated,
                "status": "Isolamento 100% Offline Ativo"
                if self.network_isolated
                else "Conexão Segura Ativa (Com DLP)",
                "blocked_attempts": self.blocked_outbound_attempts,
            },
            "cyber_badge": "🛡️ Blindagem Cibernética Ativa (Zero Inbound • DLP Estrito)",
            "uptime_since": self.boot_time,
        }


# Instância singleton global do CyberShield
cyber_shield = CyberShield()
