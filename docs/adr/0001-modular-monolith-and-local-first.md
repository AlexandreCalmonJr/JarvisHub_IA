# ADR 0001: Arquitetura Monólito Modular e Princípio Local-First

- **Status**: Aceite
- **Data**: 2026-11-05
- **Autores**: Equipa JARVIS AI HUB
- **Contexto**: Fase 0 / Fase 1 do Plano Mestre v1.0

---

## 1. Contexto e Problema

O **JARVIS AI HUB** deve suportar 26 perfis especializados de agentes capazes de analisar projetos preexistentes, planear arquitetura, auditar segurança, propor código e executar automações.

O hardware de desenvolvimento de referência é:
- **SO**: Windows 10 Pro
- **CPU**: Intel Core i5-8265U (4 núcleos / 8 threads)
- **RAM**: 32 GB
- **GPU**: Intel UHD Graphics 620 (integrada, sem aceleração de inferência dedicada)
- **Armazenamento**: SSD 500 GB (~300 GB livres)

Distribuir 26 agentes como 26 microsserviços ou processos LLM independentes causaria sobrecarga inaceitável de concorrência, overhead de IPC, saturação de memória e latência severa. Além disso, expor serviços de IA à internet viola a diretriz de privacidade estrita para códigos e dados locais.

---

## 2. Decisão

1. **Monólito Modular**:
   - Um único processo backend central em **Python + FastAPI**, estruturado em módulos internos isolados (`services/`, `packages/`, `agents/`, `skills/`).
   - Comunicação interna por chamadas assíncronas tipadas e schemas validados (Pydantic v2), sem latência de rede interna.
   - Banco de dados embutido **SQLite (aiosqlite/SQLAlchemy)** para metadados, sessões, auditoria e tarefas.

2. **Estratégia Local-First**:
   - Inferência primária 100% offline via **Ollama** executando na CPU local.
   - Fila de inferência estrita com concorrência máxima de 1 modelo pesado ativo em simultâneo.
   - Os 26 agentes são **perfis lógicos** que partilham os modelos quantizados disponíveis (`llama3.2:3b` para orquestração/Master; `qwen2.5-coder:7b` para tarefas de código/revisão; `qwen2.5:7b` para raciocínio analítico).

3. **Segurança Externa e Autoridade Zero aos Agentes**:
   - Nenhum modelo ou agente tem permissão para conceder privilégios a si mesmo.
   - O `Security Core` (backend) valida schemas, permissões em allowlists estritas e exige aprovação humana explícita antes de qualquer escrita em disco, comando ou rede.
   - Execução de tarefas em projetos existentes utiliza branches ou *Git worktrees* isoladas com prévia geração de diff e suporte a rollback.

---

## 3. Consequências

### Positivas:
- Consumo previsível de RAM e CPU, adequado ao notebook.
- Latência mínima e sem dependência de chaves de API pagas ou ligação à internet.
- Fácil manutenção, testes automatizados integrados e rastreabilidade simples.
- Inicialização e paragem determinísticas através de um único ponto de comando.

### Negativas / Mitigações:
- Concorrência de geração sequencial ou limitada (mitigada por modelos 3B rápidos e fila prioritária).
- Para projetos massivos, futura migração de SQLite para PostgreSQL é suportada sem alterar as interfaces de serviço.
