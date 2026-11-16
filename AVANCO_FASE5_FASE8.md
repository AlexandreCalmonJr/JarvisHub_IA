# Avanço da Fase 5 e Fase 8 — Estado em 16/11/2026

> **Progresso pós-Gate 3:** Conclusão da substituição de simulações com **SIM-03** (Segurança menos heurística via `pip-audit`, base OSV offline expandida e Bandit AST) e avanço da Fase 8 com **V1** (Assistente de Voz Desktop em segundo plano com atalho global, autostart e follow-up).

---

## 1. Fase 5 — Substituição de Simulações (SIM-03)

| Componente | Antes (Heurístico) | Agora (Real e Resiliente) |
|---|---|---|
| **Auditoria de Dependências (Supply Chain)** | Apenas listava pacotes sem cruzamento com CVEs reais | Ferramenta `audit_dependencies`: executa `pip-audit` via PyPI/OSV com relatório de CVEs, severidades e versões de remediação recomendadas. Fallback transparente para base offline de CVEs (PyPI e NPM) em ambientes air-gapped ou isolados. |
| **Scanner SAST (OWASP Top 10)** | Regex estático superficial | Análise estática profunda via árvore sintática (AST) com **Bandit** para Python (CWEs mapeadas, IDs Bandit B102, B301, B602, B608, etc.) combinada com pré-filtro multi-linguagem (JS, TS, Go, Dart). |
| **Integração nas Ferramentas** | Exposto apenas a scans manuais | Ferramenta `audit_dependencies` registrada no Tool Gateway e disponível aos 26 especialistas e ao Coding Agent. |

---

## 2. Fase 8 — Programa de Voz (V1 Concluído no Desktop)

| Funcionalidade | Implementação no `apps/voice_daemon/main.py` | Estado |
|---|---|---|
| **Atalho Global de Push-to-Talk** | Thread de escuta Win32 `RegisterHotKey` (`Ctrl+Shift+J`) permitindo acionamento instantâneo de voz a partir de qualquer aplicativo do Windows. | ✅ Concluído |
| **Inicialização com o Windows (Autostart)** | Gerenciamento via Registro do Windows (`HKCU\Software\Microsoft\Windows\CurrentVersion\Run`) com opção alternável no menu da bandeja (`pystray`). | ✅ Concluído |
| **Notificações Visuais de Desktop** | Alertas de status do microfone e solicitações de aprovação humana sensível disparados diretamente na bandeja do Windows (`self.tray.notify`). | ✅ Concluído |
| **Janela de Follow-up (Conversa Fluida)** | Janela ativa de 6 segundos pós-resposta com detecção de fala VAD para continuidade do diálogo sem necessidade de repetir a palavra de ativação "Hey Jarvis". | ✅ Concluído |
| **Isolamento e Segurança de Áudio** | 0 bytes de áudio saem do PC; apenas o texto transcrito localmente via Whisper é enviado à API autenticada (`/api/v1/voice/command` e `/api/v1/chat`). | ✅ Concluído |

---

## 3. Cobertura de Testes Automatizados

- `tests/unit/test_specialized_tools.py`: 11/11 testes verdes (incluindo detecção de CVEs e projeto seguro).
- `tests/integration/test_frente_07.py`: 4/4 testes verdes (cobrindo scanner de CVEs e sandbox red team).
- `tests/unit/test_voice_daemon.py`: 4/4 testes verdes (cobrindo captura PCM, VAD, hotkey, autostart e notificações).
- `ruff check .`: 100% limpo em todo o repositório.
