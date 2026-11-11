# Plano de Testes, Benchmark e Critérios de Release — 3.0.1

> **Estado:** candidato de homologação. Este documento define os gates; não declara resultados que ainda não foram executados no commit atual.

## 1. Pirâmide de testes

- **Unitários:** contratos, serviços, modelos, persistência e utilitários.
- **Segurança:** autenticação, autorização, sessões, KeyVault, contenção de paths, aprovação humana, ToolGateway e Kill Switch.
- **Integração:** rotas FastAPI com ASGITransport e persistência SQLite.
- **E2E:** bootstrap → login → sessão autenticada; workspace → pedido → decisão humana → execução.
- **Dashboard:** TypeScript e bundle Vite.
- **Mobile:** Flutter analyze, testes, APK debug e, antes da distribuição, APK/AAB release assinado.

## 2. Execução automatizada

O workflow .github/workflows/quality.yml executa:
- pytest completo e smoke de autenticação;
- Ruff com regras críticas nos ficheiros de segurança alterados e relatório do baseline completo;
- TypeScript e build de produção do dashboard;
- Flutter analyze, flutter test e build APK debug.

Cada resultado deve ser associado ao SHA do commit. Um job cancelado, pendente ou sem logs não é evidência de aprovação.

## 3. Benchmark reproduzível

O script anterior scratch/high_load_test.py não está no repositório e os números históricos de RPS/WPS foram retirados como alegações de desempenho atual.

O benchmark versionado scripts/benchmark_sqlite.py mede apenas a persistência SQLite em WAL. Não mede HTTP, inferência, orquestração ou desempenho global do produto.

Execute:

```powershell
python scripts/benchmark_sqlite.py --reads 1000 --writes 300 --readers 15 --writers 8
```

Guarde o JSON de saída com:
- SHA do commit;
- sistema operativo e hardware;
- versões Python e SQLite;
- parâmetros de concorrência;
- latências p50/p95 e throughput agregado;
- resultado de PRAGMA integrity_check.

Não publique RPS/WPS de API com base neste microbenchmark.

## 4. Critérios de aceitação

| Gate | Critério | Estado |
|---|---|---|
| Autenticação | Login real, bootstrap de uso único e rota autenticada | Pendente de CI |
| Segredos | KeyVault cifrado, DPAPI/ACL e ausência de chave em respostas/logs | Pendente de CI |
| Egresso | Todos os caminhos online governados por HybridRouter | Pendente de testes integrados |
| Workspace | Aprovação humana e allowlist de importação | Pendente de CI |
| Android | Keystore de release sob custódia e assinatura verificada | Requer segredo do responsável |
| Dashboard | TypeScript e bundle Vite sem erros | Pendente de CI |
| Mobile | analyze, testes e APK debug | Pendente de CI |
| Ruff | F821/F401/S110/S112 e redução progressiva do baseline | Pendente de CI |
| Documentação | Versões e métricas alinhadas ao commit validado | Em revisão |
| Benchmark | Execução reproduzível e artefacto JSON | Pendente de execução no ambiente-alvo |

## 5. Política de promoção

A versão 3.0.1 só poderá receber tag de release e ser promovida depois de todos os gates obrigatórios passarem. A assinatura release deve usar a mesma chave de distribuição, protegida e custodiada fora do repositório, conforme docs/operations/android-release-signing.md.

Não declarar “100% homologado”, “pronto para produção”, 265 testes aprovados, zero ignorados, 329,17 kB ou números RPS/WPS até que a execução correspondente esteja disponível e ligada ao commit exato.
