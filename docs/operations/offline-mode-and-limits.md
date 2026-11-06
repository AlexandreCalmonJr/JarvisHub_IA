# Operação em Modo Offline e Orçamento de Recursos — Fase 14

- **Data**: 2026-11-06
- **Status**: Validado e em Produção Local
- **Hardware de Referência**: Intel Core i5-8265U (4C/8T), 32 GB RAM, Intel HD 620, Windows 10 Pro

---

## 1. Princípio Local-First & Garantia Offline

O **JARVIS AI HUB** foi concebido para operar **100% desconectado da internet**.
Nenhuma chave de API externa, token de nuvem ou conexão com servidores de terceiros é necessária para o funcionamento pleno da plataforma.

### O que funciona 100% Offline:
1. **Conversação e Orquestração**: JARVIS Master com LangGraph e checkpoints embutidos.
2. **Inferência de Modelos Locais**: Ollama local com `llama3.2:3b`, `qwen2.5:7b` e `qwen2.5-coder:7b`.
3. **Project Workspace**: Leitura, varredura de arquivos, inventário e análise de arquitetura.
4. **Git Seguro & Worktrees**: Criação de branches locais, diffs e commits de checkpoint.
5. **Auditoria e Segurança**: SAST de segredos, validação estática de skills e Permission Engine.
6. **Persistência**: Banco SQLite local embutido em `data/jarvis.db` com snapshots atômicos.
7. **Dashboard Web**: Servido localmente em `http://127.0.0.1:8000/`.

### Funcionalidades que dependem necessariamente de Internet (Opcionais e Futuras):
- Download de novos modelos adicionais para a biblioteca do Ollama (`ollama pull`).
- Push ou pull de repositórios Git hospedados em plataformas remotas (GitHub/GitLab).
- Acesso ao Gateway Online Opcional (Fase 15) caso o utilizador ative explicitamente provedores como OpenAI/Anthropic.

---

## 2. Orçamento de Recursos do Notebook

Para garantir que o notebook continue fluido para o trabalho diário do utilizador:
- **Limite de RAM**: 85% máximo (com 32 GB totais, ~27 GB utilizáveis para SO + Ollama + Hub).
- **Limite de Disco**: Mínimo de 5.0 GB livres em `C:\` exigidos para operações de escrita.
- **Limite de Concorrência de Inferência**: Exatamente 1 geração pesada por vez na CPU (`InferenceQueue`).
