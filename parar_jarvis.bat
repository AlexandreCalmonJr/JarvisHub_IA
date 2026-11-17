@echo off
cd /d "%~dp0"
chcp 65001 >nul
title JARVIS AI HUB — Parar Servidor
color 0C

echo =====================================================================
echo                JARVIS AI HUB — Parando Serviços
echo =====================================================================
echo.

for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":8000" ^| findstr "LISTENING"') do (
    echo Encerrando processo na porta 8000 (PID: %%a)...
    taskkill /F /PID %%a >nul 2>&1
)

echo Encerrando processos Python do JARVIS...
powershell -NoProfile -Command "Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -like '*uvicorn*apps.api.main*' -or $_.CommandLine -like '*apps.voice_daemon*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }" >nul 2>&1

echo.
echo [OK] Servidor e assistente de voz JARVIS finalizados com sucesso.
timeout /t 3 >nul
