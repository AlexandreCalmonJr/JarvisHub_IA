# Autenticação e gestão de contas

## Primeiro acesso

1. Inicie o backend no mesmo ambiente e diretório de dados da instalação.
2. Na pasta raiz do repositório, execute `python -m apps.api.auth_cli status` para confirmar os caminhos de credenciais.
3. Se o token inicial não estiver disponível ou tiver expirado, execute `python -m apps.api.auth_cli bootstrap --ttl 600`.
4. Abra o dashboard e selecione **Primeiro acesso**.
5. Leia o token no caminho informado pelo comando, sem o publicar em chats, logs ou screenshots. No PowerShell, pode copiar o conteúdo com:
   `Get-Content .\data\auth\bootstrap_token.txt -Raw | Set-Clipboard`
6. Cole o token no dashboard. O bootstrap é de uso único e cria uma sessão administrativa.

O caminho pode mudar quando `JARVIS_DATA_DIR` estiver definido. Use sempre o caminho mostrado pelo comando `status`.

## Criar contas individuais

Na sessão administrativa, abra **Gerir acessos** no indicador de sessão do dashboard.

- Crie uma conta para o proprietário com perfil **Administrador**.
- Crie uma conta separada para cada parceiro ou colaborador.
- **Desenvolvedor** permite trabalhar nos módulos autorizados pelo RBAC.
- **Auditor** é um perfil de leitura.
- Não existe auto-registo público.

As palavras-passe precisam ter pelo menos 12 caracteres e são armazenadas com PBKDF2-HMAC-SHA256 (310.000 iterações e salt aleatório). O dashboard não armazena a palavra-passe após o login. O backend aplica rate limit às tentativas.

O administrador pode redefinir a palavra-passe e ativar/desativar contas. Redefinir uma palavra-passe ou desativar uma conta revoga as sessões existentes desse utilizador. O último administrador ativo não pode ser desativado.

## Sessões e tokens

- O login por conta cria uma sessão no servidor e entrega-a num cookie HttpOnly, SameSite=Strict.
- O token admin e o bootstrap continuam disponíveis como caminhos de recuperação/provisionamento.
- O token bootstrap expira e só pode ser utilizado uma vez.
- Nunca partilhe o token admin; use contas individuais para o acesso diário.

## Limites atuais

A gestão de contas é local à instalação e não inclui recuperação por e-mail, MFA ou sincronização entre instalações. Para expor o dashboard fora de uma rede confiável, configure HTTPS e origens permitidas antes da disponibilização.
