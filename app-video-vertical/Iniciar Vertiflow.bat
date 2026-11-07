@echo off
rem Abre Vertiflow en el navegador (Windows). Requiere Node.js 22 y FFmpeg.
cd /d "%~dp0"
if not exist node_modules (
  echo Instalando dependencias por primera vez...
  call npm install --omit=dev
)
node bin\cli.js app
pause
