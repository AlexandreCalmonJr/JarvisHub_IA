# Plano de migração do Jarvis Hub para PostgreSQL

## Objetivo e estado

PostgreSQL será o banco transacional principal. SQLite permanece preservado como origem de migração e backup temporário até que a paridade funcional, a integridade dos dados e os testes de isolamento sejam aprovados.

**Estado desta etapa:** infraestrutura Docker isolada criada. O runtime da aplicação ainda utiliza SQLite; não altere `DATABASE_URL` nem considere a migração concluída até a implementação do adaptador e dos testes.

## Decisões

- PostgreSQL 17 com imagem pgvector, para permitir extensão vetorial quando a memória semântica for implementada.
- Docker Compose com volume nomeado persistente.
- Porta publicada apenas em loopback (`127.0.0.1`).
- Credenciais fornecidas por arquivo `.env` local, nunca versionado.
- SQLAlchemy 2.x como camada de persistência e Alembic para migrações versionadas.
- SQLite original preservado, sem exclusão ou conversão destrutiva.

## Etapas obrigatórias

1. Inventariar tabelas, índices, constraints, migrações SQLite e todos os pontos de acesso SQL direto.
2. Definir modelos SQLAlchemy e estratégia compatível para IDs, timestamps, JSON, transações e consultas.
3. Implementar repositórios/adaptador PostgreSQL sem quebrar o runtime SQLite durante a transição.
4. Criar migrações Alembic revisáveis, incluindo extensão pgvector e índices.
5. Criar ferramenta de exportação/importação idempotente, preservando IDs, relações, owner_user_id e registos legados sem proprietário.
6. Comparar contagens por tabela, chaves órfãs, constraints, checksums quando aplicável e integridade.
7. Testar autenticação, isolamento entre contas, concorrência, rollback, backup e recuperação.
8. Executar benchmark equivalente SQLite/PostgreSQL com mesmo conjunto de dados e carga.
9. Ativar PostgreSQL por configuração explícita; manter rollback documentado para SQLite.
10. Só remover suporte SQLite após decisão explícita e backups verificados.

## Critérios para promover PostgreSQL

- Suite de testes de backend aprovada.
- Migração repetível e sem perda de dados.
- Nenhum acesso cruzado entre utilizadores.
- Backups e restauração testados.
- Consultas críticas e endpoints validados no PostgreSQL.
- Procedimento de rollback documentado e testado.

## Inicialização local

1. Copie `.env.example` para `.env` nesta pasta.
2. Substitua a senha de exemplo por uma senha forte e exclusiva.
3. Execute `docker compose --env-file .env -f compose.yaml up -d` a partir desta pasta.
4. Verifique com `docker compose --env-file .env -f compose.yaml ps`.

Para parar sem apagar os dados: `docker compose --env-file .env -f compose.yaml down`.

**Não execute `docker compose down -v`** durante a fase de testes: isso elimina o volume persistente do banco.
