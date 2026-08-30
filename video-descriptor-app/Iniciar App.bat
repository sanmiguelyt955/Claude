@echo off
setlocal
cd /d "%~dp0"

set PORT=4501
set URL=http://localhost:%PORT%

rem Revisa si el puerto ya esta en uso (la app ya esta corriendo)
powershell -NoProfile -Command "(Test-NetConnection -ComputerName localhost -Port %PORT% -WarningAction SilentlyContinue).TcpTestSucceeded" | findstr /C:"True" >nul

if %errorlevel%==0 (
    echo La app ya estaba corriendo. Abriendo...
) else (
    echo Iniciando servidor en segundo plano...
    start "Video Descriptor - Servidor" /min cmd /c "npm start"

    rem Espera a que el servidor responda antes de abrir el navegador
    set /a intentos=0
    :esperar
    set /a intentos+=1
    timeout /t 1 /nobreak >nul
    powershell -NoProfile -Command "(Test-NetConnection -ComputerName localhost -Port %PORT% -WarningAction SilentlyContinue).TcpTestSucceeded" | findstr /C:"True" >nul
    if not %errorlevel%==0 if %intentos% lss 15 goto esperar
)

start "" "%URL%"
