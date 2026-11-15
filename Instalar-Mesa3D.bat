@echo off
chcp 65001 >nul
cd /d "%~dp0"
TITLE Mesa3D - Instalacao automatica
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0instalador\instalar-windows.ps1"
if errorlevel 1 (
  echo.
  echo A instalacao nao foi concluida. Confira a mensagem acima.
  pause
)
