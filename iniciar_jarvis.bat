@echo off
cd /d "%~dp0"
chcp 65001 >nul
title JARVIS AI HUB -- Inicializador
color 0B

REM Inicializacao de variaveis padrao
set "BIND_HOST=127.0.0.1"
set "PORT=8000"
set "LAN_MODE=0"
set "DRY_RUN=0"
set "NO_BROWSER=0"

REM Leitura de variaveis de ambiente opcionais
if /I "%JARVIS_LAN%"=="1" (
    set "LAN_MODE=1"
    set "BIND_HOST=0.0.0.0"
)
if not "%JARVIS_PORT%"=="" set "PORT=%JARVIS_PORT%"

REM Processamento de argumentos de linha de comando
:parse_args
if "%~1"=="" goto done_args
if /I "%~1"=="--help" goto show_help
if /I "%~1"=="-h" goto show_help
if /I "%~1"=="/?" goto show_help
if /I "%~1"=="--lan" (
    set "LAN_MODE=1"
    set "BIND_HOST=0.0.0.0"
    shift
    goto parse_args
)
if /I "%~1"=="--dry-run" (
    set "DRY_RUN=1"
    shift
    goto parse_args
)
if /I "%~1"=="--no-browser" (
    set "NO_BROWSER=1"
    shift
    goto parse_args
)
if /I "%~1"=="--port" (
    if not "%~2"=="" (
        set "PORT=%~2"
        shift
        shift
        goto parse_args
    )
)
if /I "%~1"=="--host" (
    if not "%~2"=="" (
        set "BIND_HOST=%~2"
        shift
        shift
        goto parse_args
    )
)
shift
goto parse_args

:show_help
echo =====================================================================
echo               JARVIS AI HUB -- Inicializador
echo =====================================================================
echo.
echo Uso: iniciar_jarvis.bat [opcoes]
echo.
echo Opcoes:
echo   --lan         Inicia o JARVIS acessivel na rede local (host 0.0.0.0)
echo   --host HOST   Define o host de escuta (padrao: 127.0.0.1)
echo   --port PORT   Define a porta da API Core (padrao: 8000)
echo   --no-browser  Nao abre automaticamente o navegador ao iniciar
echo   --dry-run     Valida ambiente e configuracoes sem iniciar servicos
echo   --help, -h    Exibe esta mensagem de ajuda
echo.
exit /b 0

:done_args
if not defined BIND_HOST set "BIND_HOST=127.0.0.1"
if not defined PORT set "PORT=8000"

echo =====================================================================
echo               JARVIS AI HUB -- Plataforma de Agentes
echo =====================================================================
echo.
echo [1/4] Verificando ambiente de execucao...

if not exist ".venv\Scripts\python.exe" (
    echo [ERRO] Ambiente virtual .venv nao encontrado!
    echo Execute 'python -m venv .venv' e instale as dependencias antes de iniciar.
    if "%DRY_RUN%"=="0" pause
    exit /b 1
)

if not exist "node_modules" if not exist "apps\dashboard\node_modules" (
    echo [AVISO] Dependencias Node.js nao encontradas.
    echo Instalando dependencias via npm install...
    call npm install
)

echo [2/4] Verificando build da interface web...
if not exist "apps\dashboard\dist\index.html" (
    echo [AVISO] Build da interface nao encontrado em apps\dashboard\dist.
    echo Compilando interface web via npm...
    call npm run build --prefix apps/dashboard
)

if "%LAN_MODE%"=="1" (
    REM Modo LAN: sem senha padrao. A credencial inicial e aleatoria e fica em arquivo restrito.
    echo.
    echo [AVISO] Modo LAN ativado: o hub ficara acessivel a outros dispositivos da rede.
    echo         Nenhuma senha padrao e aplicada. A senha inicial do administrador
    echo         encontra-se em: data\auth\.initial-admin-password
    echo         Use apenas em redes confiaveis e prefira HTTPS/Tailscale para acesso remoto.
    set "LOCAL_URL=http://0.0.0.0:%PORT%"
    for /f "delims=" %%I in ('.venv\Scripts\python.exe -c "import socket; print(socket.gethostbyname(socket.gethostname()))" 2^>nul') do set "LOCAL_URL=http://%%I:%PORT%"
) else (
    REM Modo local (padrao): apenas loopback, com a senha de homologacao documentada.
    set "JARVIS_ENVIRONMENT=development"
    set "LOCAL_URL=http://%BIND_HOST%:%PORT%"
)

echo.
echo [3/4] Verificando Second Brain Server (porta 3001)...
set "BRAIN_RUNNING=0"
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":3001" ^| findstr "LISTENING"') do set "BRAIN_RUNNING=1"
if "%BRAIN_RUNNING%"=="0" (
    if "%DRY_RUN%"=="0" (
        echo       Iniciando Second Brain Server em segundo plano...
        start "JARVIS Brain Server (3001)" /min cmd /c "npm run dev:brain --workspace apps/dashboard"
    ) else (
        echo       [DRY-RUN] Second Brain Server seria iniciado na porta 3001.
    )
) else (
    echo       Brain Server ja ativo na porta 3001.
)

echo.
echo [4/4] Preparando FastAPI Core em %LOCAL_URL% ...
echo =====================================================================
echo  Interface Web ^& Core: %LOCAL_URL%
echo  Second Brain Server:  http://127.0.0.1:3001
echo  Beacon UDP:           Porta 8001 (Descoberta Automatica de Dispositivos)
if "%LAN_MODE%"=="1" echo  URL no celular:         %LOCAL_URL%
echo  Para encerrar:        Feche esta janela ou execute 'parar_jarvis.bat'
echo  Para expor na LAN:    iniciar_jarvis.bat --lan
echo =====================================================================
echo.

if "%DRY_RUN%"=="1" (
    echo [DRY-RUN] Verificacao concluida com sucesso. Nenhum servico foi iniciado.
    exit /b 0
)

if "%NO_BROWSER%"=="0" (
    start "" "%LOCAL_URL%"
)

.venv\Scripts\python.exe -m uvicorn apps.api.main:app --host %BIND_HOST% --port %PORT%
