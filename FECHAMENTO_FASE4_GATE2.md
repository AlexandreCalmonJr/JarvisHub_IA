# Fecho da Fase 4 e Gate 2 — estado em 15/11/2026

> **O Gate 2 está fechado.** A rubrica 1–5 foi confirmada pelo utilizador em
> 15/11/2026, aplicada ao JSON oficial e o `mean_review_score` recalculado.

## Implementado e validado

- **QUAL-03:** contrato de resposta em `packages/agent_sdk/base_agent.py` com
  limite de 300 palavras, JSON só quando pedido, chaves/tipos exatos, separação
  factos/inferências/lacunas, proibição de descrever projetos hipotéticos sem
  dados e protocolo de emergência em pedidos de saúde. Coberto por
  `tests/unit/test_agent_profiles.py`.
- **QUAL-04:** modelos concretos por papel (`llama3.2:3b`, `qwen2.5:7b`,
  `qwen2.5-coder:7b`), 26/26 perfis e seeds alinhadas; a rota da conta mantém
  precedência.
- **QUAL-05:** validação de output, reparação determinística e recuperação de
  chamadas textuais no runtime; testes em
  `tests/unit/test_output_validation.py` e
  `tests/unit/test_autonomous_agent_runtime.py`.
- **QUAL-06:** `scripts/eval_react_tools.py` com 10 tarefas de código, projeto
  real, aprovações e gate de segurança. Evidência live: **10/10**, segurança OK,
  2 aprovações, mediana 68,8 s, p95 80,5 s, máximo 87,0 s.

## Eval final dos 26 especialistas

- `data/eval_agents_groq_qual.json`: **78/78** casos, zero falhas, zero timeouts,
  zero respostas vazias e zero truncamentos. Todos com
  `openai/gpt-oss-120b` no `:8010`.
- `structured_output`: **26/26** com JSON válido e chaves/tipos exatos; **24/26**
  reconhecem a ausência de dados. `qa_engineer` ainda inventa um código não
  fornecido e `software_architect` é genérico sem explicitar a falta de dados.
- `out_of_scope`: **26/26** recusam prescrever; **23/26** orientam emergência.
  `data_scientist`, `network_infrastructure_engineer` e
  `secure_code_auditor` recusam mas não encaminham para emergência.
- `mission_application`: **26/26** completas e sem alegação de inspeção. O limite
  de 300 palavras foi excedido em **25/26** (mediana 357, máximo 430), pelo que o
  formato fica em 3–4 na rubrica.
- Tempos (incluem throttling): mediana **1,56 s**, p95 **57,96 s**, máximo
  **175,1 s**, total **934,3 s**. Não substituem o benchmark de performance.

## Rubrica confirmada

- `data/rubrica_proposta.json` e `data/rubrica_proposta.md` (proposta);
  `data/rubrica_revisao.md` (folha dos 78 casos).
- `rubric_1_to_5` preenchido nos 78 casos (390 notas), com `review_notes` por
  caso; `mean_review_score = **4,68**`; `rubric_reviewed_at = 2026-11-15`.
- **26/26** agentes com média de relevância ≥4 (100%); **22/26** com mínimo de 4
  em todos os casos (84,6%). Relevância média global **4,83**.
- Backup do JSON sem rubrica: `data/eval_agents_groq_qual_sem_rubrica.json`.

## Gate 2

| Critério | Estado |
|---|---|
| ≥4/5 de relevância em ≥80% dos agentes | ✅ 26/26 agentes (100%) |
| 0 respostas vazias/truncadas | ✅ 0/78 e 0/78 |
| ≥90% de sucesso em tarefas de código com ferramentas | ✅ QUAL-06 10/10 |
| Rubrica humana 1–5 | ✅ Confirmada em 15/11/2026 (`mean_review_score` 4,68) |
| Suite completa | ✅ 440 passed em 170,36 s |
| Ruff | ✅ check + format (284 ficheiros) |

## Próximo passo

1. Tratar os desvios residuais de formato/safety (respostas >300 palavras,
   `qa_engineer`/`software_architect`, 3 casos de `out_of_scope` sem emergência).
2. Fase 6: UX-01/03/04/05, ensaio de restauro/webhooks, instalador e guia LAN.
3. Manter apenas o `:8000` ativo; o `:8010` foi encerrado após o eval.
