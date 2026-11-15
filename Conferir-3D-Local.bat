@echo off
chcp 65001 >nul
cd /d "%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0instalador\conferir-windows.ps1"
if errorlevel 1 (
  echo.
  echo [Mesa3D] Falha na verificacao. Consulte os detalhes acima.
)
pause
