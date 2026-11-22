@echo off
cd /d "%~dp0"
chcp 65001 >nul
title JARVIS AI HUB -- Parar Servicos
color 0C

echo =====================================================================
echo                JARVIS AI HUB -- Parando Servicos
echo =====================================================================
echo.

REM 1. Encerra processos escutando nas portas do ecossistema JARVIS (8000, 3001, 3000, 8080)
echo Verificando portas 8000, 3001, 3000, 8080...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":8000" ^| findstr "LISTENING"') do (
    echo Encerrando processo na porta 8000 [PID: %%a]...
    taskkill /F /PID %%a >nul 2>&1
)
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":3001" ^| findstr "LISTENING"') do (
    echo Encerrando processo na porta 3001 [PID: %%a]...
    taskkill /F /PID %%a >nul 2>&1
)
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":3000" ^| findstr "LISTENING"') do (
    echo Encerrando processo na porta 3000 [PID: %%a]...
    taskkill /F /PID %%a >nul 2>&1
)
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":8080" ^| findstr "LISTENING"') do (
    echo Encerrando processo na porta 8080 [PID: %%a]...
    taskkill /F /PID %%a >nul 2>&1
)

REM 2. Encerra processos Python e Node do JARVIS via PowerShell WMI query
echo Encerrando processos residuais em segundo plano...
powershell -NoProfile -Command "Get-CimInstance Win32_Process -ErrorAction SilentlyContinue | Where-Object { $_.CommandLine -and ($_.CommandLine -like '*uvicorn*apps.api.main*' -or $_.CommandLine -like '*apps.voice_daemon*' -or $_.CommandLine -like '*server.ts*' -or $_.CommandLine -like '*apps\dashboard*') } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }; exit 0" >nul 2>&1

echo.
echo [OK] Servicos JARVIS (FastAPI :8000, Brain :3001, Vite :3000, Gateway :8080) finalizados com sucesso.
exit /b 0
