# Convenções de Código, Branches e Commits — JARVIS AI HUB

---

## 1. Convenções de Git & Branches

- **Branch Principal**: `main` (código estável e testado).
- **Branches de Desenvolvimento**:
  - `feat/<nome-da-funcionalidade>` (novas funcionalidades)
  - `fix/<descricao-do-bug>` (correções)
  - `sec/<ajuste-de-seguranca>` (políticas e segurança)
  - `jarvis/<task-id>-<descricao>` (worktree dedicada e isolada para alterações propostas por agentes)

---

## 2. Padrão de Commits (Conventional Commits)

Os commits seguem o padrão `tipo(escopo): descrição concisa`:
- `feat(security_core): adiciona validação de path traversal`
- `fix(model_runtime): corrige timeout na fila de concorrência`
- `docs(adr): documenta ADR-0001`
- `test(contracts): adiciona asserções para os 26 papéis de agentes`
- `refactor(orchestration): modulariza nós do grafo LangGraph`

---

## 3. Padrões de Código Python

- **Formatador e Linter**: `ruff` com limite de linha de 100 caracteres.
- **Tipagem**: Type hints completos com validação estrita via **Pydantic v2**.
- **Testes**: `pytest` com modo assíncrono habilitado (`asyncio_mode = "auto"`).
- **Asserções de Segurança**: Nenhuma ferramenta pode ser invocada sem validação prévia de permissões no `SecurityCore`.
