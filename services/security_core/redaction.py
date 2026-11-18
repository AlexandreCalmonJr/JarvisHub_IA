import re
from typing import Any

# Padrões comuns de segredos para mascaramento/redação. Cobrem os formatos
# realmente emitidos pelos provedores usados pelo hub (OpenAI/Anthropic, Groq,
# Google, AWS, GitHub, Hugging Face, Stripe, Slack) e pares chave/valor em
# texto simples ou JSON.
SECRET_PATTERNS = [
    # `api_key=...`, `"token": "..."`, `password: ...`, etc. Mantém o nome da
    # chave e oculta apenas o valor.
    re.compile(
        r"(?i)(api[_-]?key|access[_-]?key|private[_-]?key|client[_-]?secret|"
        r"account[_-]?key|aws_secret_access_key|secret|password|passwd|token|"
        r"auth[_-]?token|authorization|bearer)['\"]?\s*[:=]\s*['\"]?([^'\"\s,;}\]]+)['\"]?"
    ),
    # OpenAI (`sk-`, `sk-proj-`, `sk-svcacct-`), Anthropic (`sk-ant-...`) e
    # compatíveis.
    re.compile(r"\bsk-(?:proj-|svcacct-|ant-[a-z0-9]+-)?[A-Za-z0-9_-]{16,}\b"),
    re.compile(r"\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{20,}\b"),
    re.compile(r"\bgithub_pat_[A-Za-z0-9_]{20,}\b"),
    re.compile(r"\bgsk_[A-Za-z0-9]{16,}\b"),
    re.compile(r"\bAIza[0-9A-Za-z_-]{30,}\b"),
    re.compile(r"\b(?:AKIA|ASIA)[0-9A-Z]{16}\b"),
    re.compile(r"\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b"),
    re.compile(r"(?i)(\bBearer)\s+([A-Za-z0-9._~+/=-]{16,})"),
    re.compile(r"\bxox[baprs]-[A-Za-z0-9-]{10,}\b"),
    re.compile(r"\bhf_[A-Za-z0-9]{20,}\b"),
    re.compile(r"\b(?:sk|rk)_(?:live|test)_[A-Za-z0-9]{16,}\b"),
    re.compile(
        r"-----BEGIN\s+(?:[A-Z0-9 ]+)?PRIVATE KEY-----[\s\S]*?"
        r"-----END\s+(?:[A-Z0-9 ]+)?PRIVATE KEY-----"
    ),
]

REDACTED_MASK = "[REDACTED_SECRET]"

# Chaves de dicionário que identificam um segredo. O teste usa limites de
# palavra para não mascarar, por exemplo, `keywords` ou `monkey`.
_SENSITIVE_KEY_RE = re.compile(
    r"(?i)(?:^|[_\-. ])(?:api[_-]?key|access[_-]?key|private[_-]?key|"
    r"client[_-]?secret|account[_-]?key|secret|password|passwd|token|"
    r"credential|authorization|auth|key)(?:$|[_\-. ])"
)


def redact_string(text: str) -> str:
    """Substitui padrões reconhecíveis de segredos pelo token seguro [REDACTED_SECRET]."""
    if not isinstance(text, str):
        return text

    sanitized = text
    for pattern in SECRET_PATTERNS:
        # Se for padrão chave=valor (2 grupos), mantém a chave e oculta só o valor.
        if pattern.groups == 2:
            sanitized = pattern.sub(r"\1: " + REDACTED_MASK, sanitized)
        else:
            sanitized = pattern.sub(REDACTED_MASK, sanitized)
    return sanitized


def contains_sensitive_data(text: str) -> bool:
    """Deteta padrões de segredo que exigem contenção antes de egresso externo."""
    if not isinstance(text, str) or not text:
        return False
    return any(pattern.search(text) for pattern in SECRET_PATTERNS)


def redact_data(data: dict | list | str | Any) -> Any:
    """Redige recursivamente segredos em dicionários, listas e strings."""
    if isinstance(data, str):
        return redact_string(data)
    elif isinstance(data, dict):
        cleaned_dict = {}
        for key, value in data.items():
            if _SENSITIVE_KEY_RE.search(str(key)):
                cleaned_dict[key] = REDACTED_MASK
            else:
                cleaned_dict[key] = redact_data(value)
        return cleaned_dict
    elif isinstance(data, list):
        return [redact_data(item) for item in data]
    return data
