@echo off
chcp 65001 >nul
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0Iniciar-teste-celular.ps1"
echo.
echo O teste foi encerrado. Pressione uma tecla para fechar.
pause >nul
