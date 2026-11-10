"""
JARVIS AI HUB - Modo Ponytail & Regras de Engenharia Minimalista (YAGNI / DRY)
Inspirado na aclamada skill Ponytail ('The laziest senior developer in the room').
Garante que os 26 agentes especialistas priorizem soluções simples, código limpo,
reaproveitamento interno e zero dependências desnecessárias.
"""

from enum import Enum


class PonytailLevel(str, Enum):
    OFF = "off"
    LITE = "lite"
    SENIOR = "senior"
    ULTRA = "ultra"


PONYTAIL_PROMPTS = {
    PonytailLevel.OFF: "",
    PonytailLevel.LITE: (
        "\n\n### 🌿 DIRETRIZ PONYTAIL (MODO LEVE):\n"
        "- Evite adicionar novas dependências ou pacotes no projeto se a biblioteca padrão já resolver.\n"
        "- Priorize soluções enxutas e código legível sem abstrações desnecessárias."
    ),
    PonytailLevel.SENIOR: (
        "\n\n### 🌿 PROTOCOLO PONYTAIL (SENIOR YAGNI - THE LAZIEST SENIOR DEV):\n"
        "Você opera sob a filosofia: 'O melhor código é o código que nunca precisou ser escrito'.\n"
        "Antes de propor ou gerar qualquer linha de código, aplique a ESCADA DA PREGUIÇA TÉCNICA:\n"
        "1. Esse código precisa realmente existir? Se a tarefa for suprida por um recurso já existente, NÃO escreva código novo.\n"
        "2. Está na biblioteca padrão da linguagem? (ex: `json`, `datetime`, `urllib`, `pathlib`, `collections`). Use nativo, NUNCA instale biblioteca de terceiros para tarefas básicas.\n"
        "3. A plataforma suporta nativamente? (ex: elementos HTML5 nativos `<dialog>`, `<details>`, `fetch`, CSS Flex/Grid). Não traga pacotes pesados como wrappers.\n"
        "4. Já existe no repositório? Reutilize métodos e classes existentes em vez de recriar variações redundantes.\n"
        "5. Apenas quando inevitável: escreva a menor quantidade de código limpo, robusto e seguro que resolva o problema.\n"
        "6. No rodapé da sua resposta técnica, adicione uma breve nota de honestidade: o que foi evitado e por que essa é a solução mais simples e sustentável."
    ),
    PonytailLevel.ULTRA: (
        "\n\n### 🌿 PROTOCOLO PONYTAIL (MODO ULTRA MINIMALISTA):\n"
        "Minimalismo radical: gere apenas a linha ou bloco estritamente indispensável. Sem comentários óbvios, sem wrappers, sem boilerplate. Se puder ser feito em 1 comando, entregue em 1 comando."
    ),
}


def get_ponytail_instruction(level: str | PonytailLevel = PonytailLevel.SENIOR) -> str:
    """Retorna a diretriz do Ponytail para injeção no prompt de sistema."""
    if isinstance(level, str):
        try:
            level = PonytailLevel(level.lower().strip())
        except ValueError:
            level = PonytailLevel.SENIOR
    return PONYTAIL_PROMPTS.get(level, PONYTAIL_PROMPTS[PonytailLevel.SENIOR])
