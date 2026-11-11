# Homologação local e entrega para segundo computador

## Objetivo

Validar a mesma revisão do JARVIS AI Hub primeiro no computador do responsável pelo projeto e, depois, num segundo computador limpo. Esta etapa não autoriza publicação em produção nem merge automático na `main`.

## Branch de homologação

`release/local-homologation`

A branch deve receber as correções e os testes antes da homologação. O colega deve receber exatamente o commit validado, nunca uma cópia de uma pasta de trabalho com ficheiros locais ou credenciais.

## Conta administrativa local

A conta administrativa é criada explicitamente em cada instalação. Não há senha padrão embutida no código nem credenciais partilhadas no Git.

Na raiz do repositório, executar:

```powershell
python -m apps.api.auth_cli create-admin --username admin
```

Quando solicitado, informar a senha inicial combinada para a homologação. A senha é armazenada com PBKDF2-HMAC-SHA256 e não é escrita no repositório. A senha de homologação `admin 123` é temporária e deve ser substituída por uma senha forte antes de qualquer utilização fora da rede local de testes.

Verificar o estado:

```powershell
python -m apps.api.auth_cli status
```

Se já existir um administrador ativo, o comando não cria outro automaticamente. Não apagar a base de autenticação para contornar essa proteção.

## Etapa A — computador principal

1. Confirmar que a branch é `release/local-homologation` e que o working tree está limpo ou que todas as alterações locais foram preservadas.
2. Criar/confirmar a conta administrativa local.
3. Instalar dependências a partir dos manifests versionados, sem copiar `data/`, tokens, chaves ou bases locais de outro computador.
4. Executar a suíte de testes do backend e do dashboard.
5. Executar o build do dashboard.
6. Iniciar a API e o dashboard pelo launcher oficial.
7. Validar login/logout, navegação, páginas, estados vazios/erro/loading e chamadas reais da API.
8. Validar isolamento com duas contas independentes e registar os resultados.

## Etapa B — computador do colega

1. Clonar o repositório e fazer checkout do commit de homologação aprovado.
2. Criar ambiente virtual e instalar dependências documentadas.
3. Criar a própria conta administrativa local com o comando acima; não copiar `data/auth/`, tokens, cookies, chaves de API ou base de dados do primeiro computador.
4. Iniciar o JARVIS e confirmar health check, login, navegação e funcionalidades acordadas.
5. Criar uma segunda conta de teste e verificar que projetos, tarefas, conversas, memórias, aprovações, documentos, webhooks e credenciais não atravessam contas.
6. Registar sistema operativo, versão Python/Node, commit testado e erros encontrados.

## Critérios de aprovação

- Testes automatizados do backend e dashboard executados com sucesso.
- Build do dashboard concluído.
- Login e logout funcionais.
- Duas contas sem leitura, alteração, pesquisa ou exclusão cruzada de dados.
- Credenciais e webhooks com isolamento por conta e proteção em repouso.
- Nenhum segredo, base de dados local ou ficheiro de configuração privado incluído no commit.
- Funcionalidades não suportadas ou indisponíveis apresentadas como tal, sem dados simulados apresentados como reais.

## Bloqueios de segurança conhecidos a fechar antes da entrega ao colega

- Implementar e testar o Credential Vault privado por conta; o KeyVault atual é global e protegido por permissão administrativa, o que não equivale a um cofre individual.
- Migrar Webhooks para armazenamento por conta e atualizar todos os emissores de notificações para indicar o proprietário.
- Auditar runtime de Skills, Knowledge Vault, Tool Gateway, SQL Playground, relatórios e métricas para isolamento efetivo.
- Validar migrações SQLite em cópia de segurança e manter registos legados sem proprietário sem os atribuir automaticamente.
- Não entregar a versão ao colega enquanto qualquer bloqueio acima permanecer aberto.

## Segurança das credenciais de teste

A senha `admin 123` serve apenas para a primeira homologação local solicitada pelo responsável do projeto. Não deve ser usada em produção, exposta em screenshots, enviada em mensagens ou mantida após os testes iniciais. Cada computador mantém a sua própria base de autenticação.
