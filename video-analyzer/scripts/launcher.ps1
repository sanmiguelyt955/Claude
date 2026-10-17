# Video Analyzer launcher (Windows).
#
# Every time it runs: downloads updates from GitHub, installs only what
# changed, updates the database, builds the web app if the code changed,
# starts the web app and the worker in minimized windows and opens the
# browser. Download the repository once; every later update arrives here.
#
# Compatible with Windows PowerShell 5.1 (no ??, no &&, no ternaries).

# 'Continue', not 'Stop': in Windows PowerShell 5.1, 'Stop' turns any stderr
# line of git/npm/taskkill into a crash. Exit codes are checked instead.
$ErrorActionPreference = 'Continue'

$Root = Split-Path -Parent $PSScriptRoot  # .../video-analyzer
$Port = 3000
if ($env:VIDEO_ANALYZER_PORT) { $Port = [int]$env:VIDEO_ANALYZER_PORT }
$Url = "http://localhost:$Port"
$StateDir = Join-Path $Root 'data\launcher'
$WebTitle = 'Video Analyzer - Web'
$WorkerTitle = 'Video Analyzer - Worker'
$PidFile = Join-Path $StateDir 'pids.txt'

function Say([string]$msg) { Write-Host "  $msg" }
function Step([string]$msg) { Write-Host ''; Write-Host "> $msg" -ForegroundColor Cyan }

function Fail([string]$msg) {
  Write-Host ''
  Write-Host "  ERROR: $msg" -ForegroundColor Red
  Write-Host ''
  Read-Host '  Presiona Enter para cerrar' | Out-Null
  exit 1
}

function Test-Port([int]$p) {
  $client = New-Object System.Net.Sockets.TcpClient
  try { $client.Connect('127.0.0.1', $p); return $true } catch { return $false } finally { $client.Close() }
}

# Runs a command and fails with a clear message if it exits non-zero.
function Run([string]$what, [scriptblock]$cmd) {
  & $cmd
  if ($LASTEXITCODE -ne 0) { Fail "$what fallo (codigo $LASTEXITCODE). Revisa los mensajes de arriba." }
}

function Get-Hash([string]$path) { (Get-FileHash -Path $path -Algorithm SHA256).Hash }

function Test-Changed([string]$name, [string]$value) {
  $file = Join-Path $StateDir "$name.txt"
  if (-not (Test-Path $file)) { return $true }
  return ((Get-Content -Path $file -Raw).Trim() -ne $value)
}

function Save-State([string]$name, [string]$value) {
  New-Item -ItemType Directory -Force -Path $StateDir | Out-Null
  Set-Content -Path (Join-Path $StateDir "$name.txt") -Value $value
}

# Closes the windows this launcher opened (by saved PID, whole process tree),
# with the window title as a fallback.
function Stop-App {
  if (Test-Path $PidFile) {
    foreach ($id in (Get-Content $PidFile)) {
      if ($id) { & taskkill.exe /PID $id /T /F *> $null }
    }
    Remove-Item $PidFile -Force
  }
  foreach ($title in @($WebTitle, $WorkerTitle)) {
    & taskkill.exe /FI "WINDOWTITLE eq $title*" /T /F *> $null
  }
  for ($i = 0; $i -lt 20 -and (Test-Port $Port); $i++) { Start-Sleep -Milliseconds 500 }
}

# The python that really runs: the Microsoft Store alias "python" exists but
# only opens the Store, so each candidate is checked by running it.
function Find-Python {
  foreach ($candidate in @('python', 'py', 'python3')) {
    $cmd = Get-Command $candidate -ErrorAction SilentlyContinue
    if (-not $cmd) { continue }
    $exe = (& $cmd.Source -c 'import sys; print(sys.executable)' 2>$null)
    if ($LASTEXITCODE -eq 0 -and $exe) { return ($exe | Select-Object -Last 1).Trim() }
  }
  return $null
}

Write-Host ''
Write-Host '  ====================================' -ForegroundColor Cyan
Write-Host '           Video Analyzer' -ForegroundColor Cyan
Write-Host '  ====================================' -ForegroundColor Cyan

# --- 1. What the app needs on this computer ----------------------------------
Step 'Revisando programas necesarios'
if (-not (Get-Command git -ErrorAction SilentlyContinue)) { Fail 'Falta Git. Instalalo con:  winget install Git.Git' }
if (-not (Get-Command node -ErrorAction SilentlyContinue)) { Fail 'Falta Node.js. Instalalo con:  winget install OpenJS.NodeJS.LTS' }
$nodeVersion = [version]((& node --version).TrimStart('v'))
if ($nodeVersion -lt [version]'20.11') { Fail "Node.js $nodeVersion es muy viejo (se necesita 20.11 o mas). Actualizalo con:  winget upgrade OpenJS.NodeJS.LTS" }
if (-not (Get-Command ffmpeg -ErrorAction SilentlyContinue)) { Fail 'Falta FFmpeg. Instalalo con:  winget install Gyan.FFmpeg   (y vuelve a abrir este lanzador)' }
$python = Find-Python
if (-not $python) { Fail 'Falta Python. Instalalo con:  winget install Python.Python.3.12' }
Say "Node $nodeVersion, Python y FFmpeg encontrados."

# --- 2. Updates ---------------------------------------------------------------
$running = Test-Port $Port
$updated = $false
Step 'Buscando actualizaciones'
$repo = (& git -C $Root rev-parse --show-toplevel 2>$null)
if ($LASTEXITCODE -ne 0 -or -not $repo) {
  Say 'Esta carpeta no es una copia de GitHub (git clone): no se puede actualizar sola.'
} else {
  & git -C $repo fetch --quiet *> $null
  if ($LASTEXITCODE -ne 0) {
    Say 'Sin conexion con GitHub: se usa la version que ya tienes.'
  } else {
    $behind = [int](& git -C $repo rev-list --count 'HEAD..@{u}' 2>$null)
    if ($LASTEXITCODE -ne 0) {
      Say 'Esta rama no sigue a ninguna de GitHub: no se actualiza.'
    } elseif ($behind -eq 0) {
      Say 'Ya tienes la ultima version.'
    } else {
      $dirty = (& git -C $repo status --porcelain --untracked-files=no)
      if ($dirty) {
        Say "Hay $behind actualizacion(es), pero tienes archivos modificados a mano; no se actualiza para no perderlos."
      } else {
        Say "Hay $behind actualizacion(es). Descargando..."
        if ($running) { Say 'Cerrando la app para actualizarla...'; Stop-App; $running = $false }
        Run 'La descarga de la actualizacion' { & git -C $repo pull --ff-only --quiet }
        $updated = $true
        Say 'Actualizada.'
      }
    }
  }
}

if ($running) {
  Step 'La app ya estaba abierta'
  Start-Process $Url
  exit 0
}

Set-Location $Root

# --- 3. Install only what changed --------------------------------------------
Step 'Preparando'
if (-not (Test-Path (Join-Path $Root 'package-lock.json'))) { Fail "No encuentro package-lock.json en $Root. Abre el lanzador desde la carpeta video-analyzer." }
$lockHash = Get-Hash (Join-Path $Root 'package-lock.json')
if (-not (Test-Path (Join-Path $Root 'node_modules')) -or (Test-Changed 'npm' $lockHash)) {
  Say 'Instalando dependencias de Node (la primera vez tarda unos minutos)...'
  # --ignore-scripts: better-sqlite3 ships prebuilt binaries, but npm would
  # still try to compile it (it has a binding.gyp) and that needs Visual
  # Studio, which a normal Windows PC does not have.
  Run 'npm ci' { & npm ci --no-audit --no-fund --ignore-scripts }
  Save-State 'npm' $lockHash
}

$requirements = Join-Path $Root 'packages\perception\scripts\requirements.txt'
$reqHash = Get-Hash $requirements
if (Test-Changed 'pip' $reqHash) {
  Say 'Instalando dependencias de Python (Whisper)...'
  Run 'pip install' { & $python -m pip install --disable-pip-version-check -q -r $requirements }
  Save-State 'pip' $reqHash
}

$envLocal = Join-Path $Root '.env.local'
if (-not (Test-Path $envLocal)) {
  Copy-Item (Join-Path $Root '.env.example') $envLocal
  # The analysis this launcher is for: frames + our Whisper + Gemini/Claude.
  (Get-Content $envLocal) -replace '^ANALYSIS_ENGINE=$', 'ANALYSIS_ENGINE=perception' | Set-Content $envLocal
  Write-Host ''
  Write-Host '  Se creo el archivo de configuracion .env.local.' -ForegroundColor Yellow
  Write-Host '  Pon tu clave de Anthropic (ANTHROPIC_API_KEY) y/o de Gemini (GEMINI_API_KEY),' -ForegroundColor Yellow
  Write-Host '  guarda el archivo y cierralo para continuar.' -ForegroundColor Yellow
  Start-Process notepad.exe $envLocal -Wait
}

Say 'Actualizando la base de datos...'
Run 'La migracion de la base de datos' { & npm run --silent db:migrate }

$head = (& git -C $Root rev-parse HEAD 2>$null)
if (-not $head) { $head = 'sin-git' }
if ($updated -or -not (Test-Path (Join-Path $Root 'apps\web\.next\BUILD_ID')) -or (Test-Changed 'build' $head)) {
  Say 'Compilando la app (solo cuando hay cambios; tarda un minuto)...'
  Run 'La compilacion' { & npm run --silent build }
  Save-State 'build' $head
}

# --- 4. Start -----------------------------------------------------------------
Step 'Abriendo Video Analyzer'
$env:PYTHON_BIN = $python  # the pipeline would otherwise call "python3", which Windows usually lacks
$worker = Start-Process cmd.exe -PassThru -WorkingDirectory $Root -WindowStyle Minimized -ArgumentList '/k', "title $WorkerTitle & npm run start --workspace=@cva/worker"
$web = Start-Process cmd.exe -PassThru -WorkingDirectory (Join-Path $Root 'apps\web') -WindowStyle Minimized -ArgumentList '/k', "title $WebTitle & npx next start -p $Port"
New-Item -ItemType Directory -Force -Path $StateDir | Out-Null
Set-Content -Path $PidFile -Value @($worker.Id, $web.Id)

$ready = $false
for ($i = 0; $i -lt 60; $i++) {
  if (Test-Port $Port) { $ready = $true; break }
  Start-Sleep -Seconds 1
}
if (-not $ready) { Fail "La app no respondio en 60 s. Abre la ventana minimizada '$WebTitle' de la barra de tareas para ver el error." }

Start-Process $Url
Say "Lista en $Url"
Say "Para cerrarla usa 'Detener Video Analyzer.bat'."
Start-Sleep -Seconds 3
