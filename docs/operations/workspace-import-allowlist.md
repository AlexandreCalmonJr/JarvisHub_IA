# Raízes autorizadas de importação do Workspace

Por padrão, o JARVIS só permite importar diretórios que estejam dentro da própria pasta workspace. Uma pasta externa não amplia automaticamente a allowlist.

No Windows, configure as raízes explicitamente autorizadas no ambiente do processo do servidor:

```powershell
$env:JARVIS_WORKSPACE_IMPORT_ROOTS = "C:\Projetos;D:\Repositorios"
```

Em Linux/macOS, separe as raízes por vírgula:

```bash
export JARVIS_WORKSPACE_IMPORT_ROOTS="/srv/projects,/home/dev/repos"
```

Cada importação passa por duas etapas: validação de contenção da raiz e pedido de aprovação humana. O servidor só regista e inventaria o projeto depois da aprovação. Caminhos inexistentes, ficheiros em vez de diretórios, links simbólicos que escapem da raiz e diretórios fora da allowlist são recusados.

Não inclua a raiz inteira do disco, diretórios de sistema, perfis completos de utilizador, pastas de credenciais ou diretórios com dados de pacientes.