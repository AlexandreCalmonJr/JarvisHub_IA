@echo off
cd /d "%~dp0"
chcp 65001 >nul
title JARVIS AI HUB — Inicializador Automático
color 0B

echo =====================================================================
echo               JARVIS AI HUB — Plataforma de Agentes
echo =====================================================================
echo.
echo [1/3] Verificando ambiente de execução...

if not exist ".venv\Scripts\python.exe" (
    echo [ERRO] Ambiente virtual .venv não encontrado!
    echo Execute 'python -m venv .venv' antes de iniciar.
    pause
    exit /b 1
)

echo [2/3] Verificando build da interface web...
if not exist "apps\dashboard\dist\index.html" (
    echo [AVISO] Build da interface não encontrado em apps/dashboard/dist.
    echo Tentando compilar via npm...
    npm run build --prefix apps/dashboard
)

echo [3/3] Iniciando JARVIS AI Hub em http://127.0.0.1:8000 ...
echo.
echo =====================================================================
echo  O painel web será aberto automaticamente no seu navegador padrão.
echo  Para fechar o JARVIS, encerre esta janela ou execute 'parar_jarvis.bat'.
echo =====================================================================
echo.

:: Aguarda 2 segundos e abre o navegador padrão
start "" http://127.0.0.1:8000

:: Inicia o servidor FastAPI local estritamente em 127.0.0.1 (Zero Inbound Externo)
.venv\Scripts\python.exe -m uvicorn apps.api.main:app --host 127.0.0.1 --port 8000
