# Relatório de Diagnóstico do Ambiente e Pré-Requisitos — Fase 0

- **Data de Avaliação**: 2026-11-05 / 2026-11-06
- **Status do Gate**: Concluído e Aceite

---

## 1. Inventário de Hardware e Sistema Operativo

| Componente | Especificação Detetada | Estado / Avaliação |
| :--- | :--- | :--- |
| **Sistema Operativo** | Windows 10 Pro (Build 19041.6456 / 2009) | Suporte gratuito geral encerrado em 14/10/2025. **Decisão**: Operação 100% local-first em localhost e rede privada (Tailscale), sem qualquer porta exposta à internet pública. |
| **Processador** | Intel(R) Core(TM) i5-8265U CPU @ 1.60GHz | 4 núcleos físicos / 8 threads lógicos. Baseline CPU fixada. |
| **GPU Integrada** | Intel(R) UHD Graphics 620 (Driver 31.0.101.2145) | Sem aceleração confiável para LLM. CPU é a rota primária. |
| **Memória RAM** | 32 GB (33.422.348 KB visíveis, ~24 GB livres) | Capacidade ideal para concorrência de 1 modelo Ollama (~2.5-5GB) + Monólito FastAPI. |
| **Armazenamento** | SSD 500 GB (~300 GB livres em `C:\`) | Espaço estimado: Hub (~500MB), Modelos (~12GB), Logs e Worktrees (~5GB). Folga ampla (>280GB). |
| **Virtualização** | WSL2 ativo (`docker-desktop` v2) | Suporte a sandbox isolada via Docker e containers sem privilégios. |
| **Runtimes Base** | Python 3.12 (via `uv`), Node.js v24.22, Flutter 3.47, Git 2.56 | Todos operacionais e verificados via linha de comando. |

---

## 2. Estrutura de Diretórios e Orçamento de Recursos

- **Diretório do Hub**: `C:\Users\Administrator\Downloads\jarvis-hub`
- **Workspaces de Projetos Analisados**: `workspace/` (isolado da árvore Git principal do hub)
- **Modelos Locais**: Geridos pelo serviço Ollama (`~/.ollama/models`)
- **Backups e Snapshots**: `backups/`
- **Logs e Auditoria**: `services/observability/` e `data/`

---

## 3. Plano de Recuperação do Ambiente (Disaster Recovery)

1. **Repositório Git**: versionamento com commits convencionais e branches dedicadas.
2. **Dependências**: lockfile e versões fixadas em `pyproject.toml` executadas via `uv` (recriação de virtualenv em < 5 segundos).
3. **Modelos**: script de download automatizado para Ollama (`ollama pull llama3.2:3b`, `qwen2.5-coder:7b`).
4. **Dados do SQLite / Metadados**: cópia diária estruturada em `backups/`.
