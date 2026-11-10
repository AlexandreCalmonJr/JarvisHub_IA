@echo off
chcp 65001 >nul
title JARVIS AI HUB — Gerador de Instalador .EXE
color 0A

echo =====================================================================
echo           JARVIS AI HUB — Compilação do Instalador Windows
echo =====================================================================
echo.

echo [Etapa 1/3] Compilando Frontend React (Vite)...
call npm run build --prefix apps/dashboard
if %errorlevel% neq 0 (
    echo [ERRO] Falha ao compilar o frontend!
    pause
    exit /b %errorlevel%
)
echo [OK] Frontend gerado em apps/dashboard/dist

echo.
echo [Etapa 2/3] Empacotando Backend e Desktop com PyInstaller...
call .venv\Scripts\pyinstaller.exe packaging\desktop.spec --clean -y
if %errorlevel% neq 0 (
    echo [ERRO] Falha no PyInstaller!
    pause
    exit /b %errorlevel%
)
echo [OK] Binários compilados em dist/JarvisHub/

echo.
echo [Etapa 3/3] Compilando Instalador .EXE com Inno Setup...
set "ISCC_PATH=C:\Users\Administrator\AppData\Local\Programs\Inno Setup 6\ISCC.exe"

if not exist "%ISCC_PATH%" (
    echo [ERRO] Compilador Inno Setup não encontrado em %ISCC_PATH%!
    pause
    exit /b 1
)

"%ISCC_PATH%" packaging\windows\installer.iss
if %errorlevel% neq 0 (
    echo [ERRO] Falha ao compilar o instalador com Inno Setup!
    pause
    exit /b %errorlevel%
)

echo.
echo =====================================================================
echo  [SUCESSO] Instalador gerado com êxito!
echo  Arquivo disponível em: dist_installer\JarvisHub-Setup-v3.0.0.exe
echo =====================================================================
echo.
pause
