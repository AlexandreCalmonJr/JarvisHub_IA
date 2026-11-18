@echo off
cd /d "%~dp0"
chcp 65001 >nul
title JARVIS AI HUB — Inicializador
color 0B

set "BIND_HOST=127.0.0.1"
set "LAN_MODE=0"
if /I "%~1"=="--lan" set "LAN_MODE=1"
if /I "%JARVIS_LAN%"=="1" set "LAN_MODE=1"
if "%LAN_MODE%"=="1" set "BIND_HOST=0.0.0.0"

echo =====================================================================
echo               JARVIS AI HUB — Plataforma de Agentes
echo =====================================================================
echo.
echo [1/3] Verificando ambiente de execucao...

if not exist ".venv\Scripts\python.exe" (
    echo [ERRO] Ambiente virtual .venv nao encontrado!
    echo Execute 'python -m venv .venv' antes de iniciar.
    pause
    exit /b 1
)

echo [2/3] Verificando build da interface web...
if not exist "apps\dashboard\dist\index.html" (
    echo [AVISO] Build da interface nao encontrado em apps/dashboard/dist.
    echo Tentando compilar via npm...
    call npm run build --prefix apps/dashboard
)

if "%LAN_MODE%"=="1" (
    :: Modo LAN: sem senha padrao. A credencial inicial e aleatoria e fica em arquivo restrito.
    echo.
    echo [AVISO] Modo LAN ativado: o hub ficara acessivel a outros dispositivos da rede.
    echo         Nenhuma senha padrao e aplicada. A senha inicial do administrador
    echo         encontra-se em: data\auth\.initial-admin-password
    echo         Use apenas em redes confiaveis e prefira HTTPS/Tailscale para acesso remoto.
    set "LOCAL_URL=http://0.0.0.0:8000"
    for /f "delims=" %%I in ('.venv\Scripts\python.exe -c "import socket; s=socket.socket(socket.AF_INET,socket.SOCK_DGRAM); s.connect(('8.8.8.8',80)); print(s.getsockname()[0]); s.close()" 2^>nul') do set "LOCAL_URL=http://%%I:8000"
) else (
    :: Modo local (padrao): apenas loopback, com a senha de homologacao documentada.
    set "JARVIS_ENVIRONMENT=development"
    set "LOCAL_URL=http://127.0.0.1:8000"
)

echo.
echo [3/3] Iniciando JARVIS AI Hub em %LOCAL_URL% ...
echo =====================================================================
echo  URL no computador: %LOCAL_URL%
if "%LAN_MODE%"=="1" echo  URL no celular:    %LOCAL_URL%
echo  Beacon UDP:        Porta 8001 (Descoberta Automatica de Dispositivos)
echo  Para encerrar:     Feche esta janela ou execute 'parar_jarvis.bat'
echo  Para expor na LAN: iniciar_jarvis.bat --lan
echo =====================================================================
echo.

start "" "%LOCAL_URL%"

.venv\Scripts\python.exe -m uvicorn apps.api.main:app --host %BIND_HOST% --port 8000
