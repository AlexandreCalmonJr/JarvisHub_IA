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

echo.
echo [OK] Servidor JARVIS finalizado com sucesso.
timeout /t 3 >nul
