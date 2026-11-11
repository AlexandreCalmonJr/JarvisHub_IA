# Rotação e custódia de credenciais

## Token administrativo

O token administrativo é criado no primeiro arranque e guardado em `admin_token.txt` dentro do diretório de autenticação, com permissões restritas. O valor não deve ser copiado para logs, tickets, chats ou ficheiros versionados.

Para rodar o token no host:

```powershell
python -m apps.api.auth_cli rotate-admin
```

O comando escreve o novo valor no ficheiro protegido e apresenta apenas o caminho. Obtenha o valor através do canal local autorizado de provisionamento. Se `JARVIS_ADMIN_TOKEN` estiver definido no ambiente, atualize/remova essa variável de forma coordenada: a variável de ambiente tem precedência sobre o ficheiro.

Depois da rotação:
1. Atualize o segredo no launcher/gestor de credenciais autorizado.
2. Inicie uma sessão nova e valide uma rota administrativa.
3. Revogue sessões antigas no painel de segurança.
4. Apague cópias temporárias e não mantenha o token em clipboard, logs ou repositórios.

## Bootstrap

O bootstrap é de uso único, tem validade curta e é validado pelo hash persistido. O token em texto existe apenas no ficheiro local restrito `bootstrap_token.txt`, para o launcher concluir o emparelhamento. Não o copie para o GitHub. Após a troca, o ficheiro é removido pelo servidor.

## Chaves de provedores

Adicione a nova chave na interface KeyVault, teste a ligação e confirme que o gateway híbrido está a utilizar a nova referência. Só depois remova a chave anterior. As respostas da API mostram apenas a máscara.

O ficheiro do cofre é cifrado com DPAPI no Windows; o modo de compatibilidade usa Fernet e um ficheiro de chave protegido por ACL. A chave DPAPI está associada ao utilizador/host Windows. Ao migrar para outro utilizador ou máquina, não copie ficheiros e espere que a DPAPI os abra: volte a provisionar as credenciais no novo host e valide o gateway antes de eliminar a instalação antiga.

## Backups

- Nunca inclua tokens, chaves em claro, ficheiros de ambiente ou dumps de sessões em backups partilhados.
- Trate o cofre cifrado e o ficheiro de chave Fernet como material sensível.
- Faça backups apenas em armazenamento cifrado e com acesso restrito.
- Teste a restauração no mesmo contexto de custódia antes de confiar no backup.
