@echo off
rem Cierra la web y el worker que abrio "Iniciar Video Analyzer.bat".
cd /d "%~dp0"
if exist "data\launcher\pids.txt" (
  for /f "usebackq delims=" %%p in ("data\launcher\pids.txt") do taskkill /PID %%p /T /F >nul 2>&1
  del "data\launcher\pids.txt" >nul 2>&1
)
taskkill /FI "WINDOWTITLE eq Video Analyzer - Web*" /T /F >nul 2>&1
taskkill /FI "WINDOWTITLE eq Video Analyzer - Worker*" /T /F >nul 2>&1
echo Video Analyzer cerrado.
timeout /t 2 >nul
