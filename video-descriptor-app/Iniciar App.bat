@echo off
setlocal
cd /d "%~dp0"

set PORT=4501
set URL=http://localhost:%PORT%

powershell -NoProfile -Command "if ((Test-NetConnection -ComputerName localhost -Port %PORT% -WarningAction SilentlyContinue).TcpTestSucceeded) { exit 0 } else { exit 1 }"

if %errorlevel%==0 (
    echo La app ya estaba corriendo. Abriendo...
) else (
    echo Iniciando servidor en segundo plano...
    start "Video Descriptor - Servidor" /min cmd /c "npm start"

    powershell -NoProfile -Command ^
        "$ok = $false;" ^
        "for ($i = 0; $i -lt 15; $i++) {" ^
        "    Start-Sleep -Seconds 1;" ^
        "    if ((Test-NetConnection -ComputerName localhost -Port %PORT% -WarningAction SilentlyContinue).TcpTestSucceeded) { $ok = $true; break }" ^
        "}" ^
        "if (-not $ok) { exit 1 } else { exit 0 }"

    if not %errorlevel%==0 (
        echo.
        echo El servidor no respondio a tiempo. Revisa la ventana minimizada
        echo "Video Descriptor - Servidor" en la barra de tareas para ver el error.
        echo.
        pause
        exit /b 1
    )
)

start "" "%URL%"
