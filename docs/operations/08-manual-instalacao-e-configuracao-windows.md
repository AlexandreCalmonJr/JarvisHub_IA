# 🪟 Manual de Instalação e Configuração no Windows

> **Projeto**: JARVIS AI HUB  
> **Sistema Operacional Alvo**: Windows 10 / Windows 11 (64-bit)  
> **Guia Passo a Passo**: Configuração Local-First em 5 Minutos  

---

## 1. Pré-Requisitos do Sistema

Antes de iniciar, certifique-se de que os seguintes softwares estão instalados na máquina Windows:

| Ferramenta | Versão Mínima | Finalidade | Como Verificar |
| :--- | :---: | :--- | :--- |
| **Python** | 3.11+ (Recomendado 3.12) | Backend FastAPI, LangGraph e serviços | `python --version` |
| **Node.js & npm** | Node 20+ / npm 10+ | Compilação do dashboard React/Vite | `node -v` |
| **Ollama** | 0.3+ | Runtime de inferência local de IA | `ollama --version` |
| **Git** | 2.40+ | Controle de versão e gestão de branches | `git --version` |

---

## 2. Passo 1: Download dos Modelos no Ollama

No terminal PowerShell, baixe os modelos recomendados para operação na CPU:

```powershell
# Modelo mestre para triagem rápida, orquestração e deliberação (Essencial)
ollama pull llama3.2:3b

# Modelo especializado em geração e revisão de código (Essencial para Devs)
ollama pull qwen2.5-coder:7b

# Modelo para raciocínio analítico e arquitetura (Opcional)
ollama pull qwen2.5:7b
```

> **Verificação**: Execute `ollama list` e confirme se `llama3.2:3b` está listado como pronto.

---

## 3. Passo 2: Clonagem e Ambiente Virtual Python

```powershell
# 1. Navegue até o diretório desejado e clone o repositório
cd C:\Projetos
git clone https://github.com/seu-usuario/jarvis-hub.git
cd jarvis-hub

# 2. Crie o ambiente virtual com Python 3.12
python -m venv .venv

# 3. Ative o ambiente virtual no PowerShell
.venv\Scripts\Activate.ps1

# 4. Atualize o pip e instale as dependências
pip install --upgrade pip
pip install -e .
```

---

## 4. Passo 3: Compilação do Painel Web (Dashboard)

```powershell
# 1. Instale as dependências do frontend SPA
npm --prefix apps/dashboard install

# 2. Compile a versão de produção otimizada com Vite
npm --prefix apps/dashboard run build

# 3. Sincronize os arquivos estáticos para a pasta dist do backend
Copy-Item -Path "apps\dashboard\dist\*" -Destination "dist" -Recurse -Force
```

---

## 5. Passo 4: Inicialização do Servidor JARVIS AI HUB

Com o ambiente virtual ativado, inicialize o servidor FastAPI confinado à máquina local:

```powershell
python -m uvicorn apps.api.main:app --host 127.0.0.1 --port 8000
```

Saída esperada no console:
```text
INFO:     Started server process [PID]
INFO:     Waiting for application startup.
INFO:     Application startup complete.
INFO:     Uvicorn running on http://127.0.0.1:8000 (Press CTRL+C to quit)
```

---

## 6. Passo 5: Verificação de Saúde da Instalação

Abra o navegador no endereço: **`http://127.0.0.1:8000`**

Ou valide via PowerShell:
```powershell
Invoke-RestMethod -Uri "http://127.0.0.1:8000/api/v1/system/health"
```

Resposta de sucesso:
```json
{
  "status": "healthy",
  "components": {
    "security_core": "operational",
    "approval_engine": "operational",
    "model_runtime": "operational",
    "kill_switch": "operational"
  }
}
```
