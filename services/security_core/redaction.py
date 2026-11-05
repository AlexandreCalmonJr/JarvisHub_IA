import re
from typing import Any, Dict, List, Union


# Padrões comuns de segredos para mascaramento/redação
SECRET_PATTERNS = [
    re.compile(r'(?i)(api[_-]?key|secret|password|passwd|token|auth[_-]?token|bearer)\s*[:=]\s*["\']?([^"\'\s,;]+)["\']?'),
    re.compile(r'sk-[a-zA-Z0-9]{20,}'),  # OpenAI style keys
    re.compile(r'ghp_[a-zA-Z0-9]{36}'),   # GitHub Personal Access Token
    re.compile(r'-----BEGIN\s+(?:RSA\s+)?PRIVATE\s+KEY-----[\s\S]*?-----END\s+(?:RSA\s+)?PRIVATE\s+KEY-----'),
]

REDACTED_MASK = "[REDACTED_SECRET]"


def redact_string(text: str) -> str:
    """Substitui padrões reconhecíveis de segredos pelo token seguro [REDACTED_SECRET]."""
    if not isinstance(text, str):
        return text

    sanitized = text
    for pattern in SECRET_PATTERNS:
        # Se for padrão chave=valor, mantém a chave e oculta apenas o valor
        if pattern.groups == 2:
            sanitized = pattern.sub(r'\1: ' + REDACTED_MASK, sanitized)
        else:
            sanitized = pattern.sub(REDACTED_MASK, sanitized)
    return sanitized


def redact_data(data: Union[Dict, List, str, Any]) -> Any:
    """Redige recursivamente segredos em dicionários, listas e strings."""
    if isinstance(data, str):
        return redact_string(data)
    elif isinstance(data, dict):
        cleaned_dict = {}
        for key, value in data.items():
            # Chaves que indicam segredos diretos têm os valores mascarados imediatamente
            if any(k in key.lower() for k in ("secret", "password", "token", "key", "credential", "auth")):
                cleaned_dict[key] = REDACTED_MASK
            else:
                cleaned_dict[key] = redact_data(value)
        return cleaned_dict
    elif isinstance(data, list):
        return [redact_data(item) for item in data]
    return data
