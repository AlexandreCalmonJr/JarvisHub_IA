# JARVIS AI HUB

**Plataforma local-first de agentes especializados para análise, desenvolvimento, segurança, dados, automação e gestão de projetos existentes.**

---

## 🎯 Visão Geral

O **JARVIS AI HUB** é uma plataforma modular de agentes de IA concebida com prioridade estrita de execução **local-first** (operando 100% offline no ambiente de desenvolvimento). O utilizador autoriza uma pasta de projeto no computador, solicita análises, recebe planos técnicos fundamentados, aprova alterações e acompanha testes e resultados com rastreabilidade total.

### Pilares Fundamentais:
1. **Local-First & Eficiência**: Concebido para hardware notebook (Intel Core i5 8ª Geração, 32 GB RAM, SSD, Intel HD 620). Fila de inferência e gestão ativa de memória para carregar apenas os modelos necessários (Ollama).
2. **Segurança como Autoridade Externa**: Modelos de IA **não** decidem as próprias permissões. O backend, o motor de políticas e o utilizador humano governam o acesso a pastas, comandos e ferramentas.
3. **26 Especializações em Perfis Lógicos**: Em vez de manter 26 modelos pesados em memória, os agentes são perfis com missões, permissões e skills dedicadas, orquestrados pelo **JARVIS Master** (LangGraph).
4. **Proteção Total de Projetos Existentes**: Operação inicial em modo *Read-only* ou *Plan-only*. Alterações de código só ocorrem em branches/worktrees isoladas do Git e com aprovação explícita.

---

## 📁 Estrutura do Repositório

```text
JARVIS-AI-HUB/
├── apps/
│   ├── api/             # Backend FastAPI (Ponto de entrada central REST & WebSockets)
│   ├── dashboard/       # Painel administrativo web (React + TypeScript)
│   └── mobile/          # Cliente móvel para controlo remoto (Flutter/Dart)
├── packages/
│   ├── contracts/       # Schemas Pydantic partilhados, contratos de agentes e eventos
│   ├── agent_sdk/       # Classes base, interfaces e ciclo de vida dos agentes
│   └── ui_shared/       # Definições visuais e componentes partilhados
├── services/
│   ├── orchestration/   # Orquestração de grafos com LangGraph
│   ├── model_runtime/   # Adaptador de inferência local (Ollama) e fila de concorrência
│   ├── project_workspace/# Gestão de pastas de projeto, inventário, diffs e Git worktrees
│   ├── tool_gateway/    # Execução controlada e validação estrita de ferramentas
│   ├── security_core/   # Permission Engine, RBAC, Approval Engine, Audit Trail e Kill Switch
│   ├── skills_manager/  # Catálogo, validação e carregamento sob demanda de skills
│   ├── memory/          # Memória em camadas (tarefa, projeto, sessões)
│   ├── resource_manager/# Monitorização de CPU/RAM e proteção térmica/hardware
│   └── observability/   # Logs estruturados, métricas e auditoria
├── agents/
│   ├── registry/        # Registo e ciclo de vida dos agentes
│   └── profiles/        # Definição dos 26 perfis de agentes especializados
├── skills/
│   ├── internal/        # Procedimentos e templates verificados nativos
│   ├── imported/        # Skills externas aprovadas e versionadas
│   └── validation/      # Validadores estáticos e sandbox de segurança de skills
├── workspace/           # Diretório local para projetos registados sob análise
├── tests/               # Testes unitários, de integração, de segurança e E2E
└── docs/                # Documentação técnica, ADRs e relatórios de fases
```

---

## 🚀 Ambiente e Requisitos Base

- **SO**: Windows 10 Pro (Operação local / rede privada Tailscale)
- **CPU**: Intel Core i5-8265U (4C/8T)
- **RAM**: 32 GB DDR4
- **Runtime Local**: Ollama com modelos quantizados:
  - `llama3.2:3b` (Master / triagem rápida)
  - `qwen2.5:7b` (Raciocínio geral)
  - `qwen2.5-coder:7b` (Análise e geração de código)
- **Python**: >= 3.11 (detetado 3.15.1)
- **Node.js**: >= 20 (detetado v24.22.1)
- **Flutter**: >= 3.20 (detetado 3.47.8)
- **Docker**: WSL2 disponível para sandbox isolada

---

## 📜 Fases de Implementação

- [x] **Fase 0**: Diagnóstico, hardware e inventário do ambiente local
- [ ] **Fase 1**: Fundação do repositório, contratos e estrutura modular *(Em progresso)*
- [ ] **Fase 2**: Núcleo de segurança, identidade, permissões e aprovação
- [ ] **Fase 3**: Runtime local de IA, benchmarks e gestão de recursos
- [ ] **Fase 4**: JARVIS Master e orquestração com LangGraph
- [ ] **Fase 5**: Agent Registry e primeiros 8 agentes
- [ ] **Fase 6**: Project Workspace: Leitura e análise read-only de projetos existentes
- [ ] *Fases 7 a 19*: Conforme definido no Plano Mestre v1.0
