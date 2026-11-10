@echo off
cd /d "%~dp0"
chcp 65001 >nul
title JARVIS AI HUB — Janela Nativa
color 0B

echo Iniciando o JARVIS AI Hub em Janela Nativa...
.venv\Scripts\python.exe apps\desktop\main_window.py
