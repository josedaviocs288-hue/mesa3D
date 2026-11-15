@echo off
cd /d %~dp0
if not exist node_modules (
  echo Instalando bibliotecas na primeira execucao...
  call npm install --omit=dev
  if errorlevel 1 pause & exit /b 1
)
if not exist .env echo Configure .env a partir de .env.example antes de entrar no painel.
echo Acesse http://localhost:8080/acesso.html apos iniciar o servidor.
npm start
