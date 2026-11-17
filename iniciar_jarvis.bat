@echo off
cd /d "%~dp0"
chcp 65001 >nul
title JARVIS AI HUB — Inicializador de Rede
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
    call npm run build --prefix apps/dashboard
)

:: Obtém o IP da rede local via Python
for /f "delims=" %%I in ('.venv\Scripts\python.exe -c "import socket; s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM); s.connect(('8.8.8.8', 80)); print(s.getsockname()[0]); s.close()" 2^>nul') do set "LOCAL_IP=%%I"
if "%LOCAL_IP%"=="" set "LOCAL_IP=192.168.1.81"

echo.
echo [3/3] Iniciando JARVIS AI Hub no IP do computador: http://%LOCAL_IP%:8000 ...
echo =====================================================================
echo  URL no computador: http://%LOCAL_IP%:8000 (ou http://127.0.0.1:8000)
echo  URL no celular:    http://%LOCAL_IP%:8000
echo  Beacon UDP ativo:  Porta 8001 (Descoberta Automática de Dispositivos)
echo  Para encerrar:     Feche esta janela ou execute 'parar_jarvis.bat'
echo =====================================================================
echo.

:: Abre o navegador padrão no IP local do computador
start "" "http://%LOCAL_IP%:8000"

:: Inicia o servidor FastAPI vinculado a todas as interfaces de rede (0.0.0.0)
.venv\Scripts\python.exe -m uvicorn apps.api.main:app --host 0.0.0.0 --port 8000
