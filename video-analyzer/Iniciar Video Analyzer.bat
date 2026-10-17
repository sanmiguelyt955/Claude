@echo off
rem Abre Video Analyzer. Cada vez que lo abres baja las actualizaciones de
rem GitHub, instala solo lo que cambio y abre la app en el navegador.
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\launcher.ps1"
