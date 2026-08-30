@echo off
title Video Descriptor - Servidor
cd /d "%~dp0"

echo ============================================
echo   VIDEO DESCRIPTOR
echo ============================================
echo.
echo Iniciando servidor local...
echo.
echo IMPORTANTE:
echo  - Mientras esta ventana este abierta, la app esta ENCENDIDA.
echo  - Si cierras esta ventana (o le das Ctrl+C), la app se APAGA.
echo  - No la cierres mientras la estes usando en el navegador.
echo.

call npm start

echo.
echo ============================================
echo   La app se detuvo.
echo   (Revisa el mensaje de arriba: si dice que el puerto
echo    ya estaba en uso, es porque YA tenias otra ventana
echo    de la app abierta — no es un error real.)
echo ============================================
echo.
pause
