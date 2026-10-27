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

# What answers on the port: $null when nothing does, else whether it is this
# app (another program on port 3000 was taken for it) and whether its worker
# runs (the page says to open this launcher again when it does not).
function Get-AppState {
  if (-not (Test-Port $Port)) { return $null }
  try {
    $answer = Invoke-WebRequest -UseBasicParsing -TimeoutSec 5 -Uri "http://127.0.0.1:$Port/api/videos"
    $json = $answer.Content | ConvertFrom-Json
    if ($null -ne $json.videos) { return [pscustomobject]@{ Ours = $true; WorkerAlive = [bool]$json.workerAlive } }
  } catch {}
  return [pscustomobject]@{ Ours = $false; WorkerAlive = $false }
}

# .env.local is UTF-8 (Node reads it so). Get-Content/Set-Content in Windows
# PowerShell 5.1 use the ANSI code page and could mangle accented paths. A
# file that is not valid UTF-8 is left alone (returns $null).
$Utf8 = New-Object System.Text.UTF8Encoding($false, $true)
function Read-EnvLines([string]$path) {
  try { return ,[System.IO.File]::ReadAllLines($path, $Utf8) } catch { return $null }
}
function Set-EnvLine([string]$path, [string]$from, [string]$to) {
  $lines = Read-EnvLines $path
  if ($null -eq $lines -or -not ($lines -contains $from)) { return $false }
  $out = foreach ($line in $lines) { if ($line -eq $from) { $to } else { $line } }
  [System.IO.File]::WriteAllLines($path, [string[]]$out, $Utf8)
  return $true
}

function Start-Worker {
  $worker = Start-Process cmd.exe -PassThru -WorkingDirectory $Root -WindowStyle Minimized -ArgumentList '/k', "title $WorkerTitle & npm run start --workspace=@cva/worker"
  New-Item -ItemType Directory -Force -Path $StateDir | Out-Null
  Add-Content -Path $PidFile -Value $worker.Id
}

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
      if (-not $id) { continue }
      # A PID saved by an earlier run may belong to another program by now:
      # only the cmd.exe windows this launcher opens are closed.
      $proc = Get-Process -Id ([int]$id) -ErrorAction SilentlyContinue
      if ($proc -and $proc.ProcessName -eq 'cmd') { & taskkill.exe /PID $id /T /F *> $null }
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
$state = Get-AppState
if ($state -and -not $state.Ours) {
  Fail "El puerto $Port lo esta usando otro programa. Cierralo, o elige otro puerto para Video Analyzer con la variable VIDEO_ANALYZER_PORT (por ejemplo 3001)."
}
$running = [bool]$state
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
  # The web answers but nothing analyzes: start the worker again.
  if (-not $state.WorkerAlive) {
    Say 'El analizador estaba cerrado: se vuelve a abrir.'
    $env:PYTHON_BIN = $python
    Set-Location $Root
    Start-Worker
  }
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
  & $python -m pip install --disable-pip-version-check -q -r $requirements
  if ($LASTEXITCODE -ne 0) {
    # A Python installed for every user needs administrator rights there;
    # the user's own folder does not.
    Say 'Reintentando en tu carpeta de usuario (sin permisos de administrador)...'
    Run 'pip install' { & $python -m pip install --user --disable-pip-version-check -q -r $requirements }
  }
  Save-State 'pip' $reqHash
}

# NVIDIA card (nvidia-smi comes with its driver): the CUDA libraries that
# let faster-whisper transcribe on it, several times faster than the CPU.
# About 1 GB, downloaded once; without them it simply stays on the CPU.
if ((Get-Command nvidia-smi -ErrorAction SilentlyContinue) -and (Test-Changed 'pip-gpu' 'cu12-v1')) {
  Say 'Tarjeta NVIDIA encontrada: instalando lo necesario para transcribir con ella (una sola vez, ~1 GB)...'
  & $python -m pip install --disable-pip-version-check -q 'nvidia-cublas-cu12' 'nvidia-cudnn-cu12>=9,<10'
  if ($LASTEXITCODE -ne 0) { & $python -m pip install --user --disable-pip-version-check -q 'nvidia-cublas-cu12' 'nvidia-cudnn-cu12>=9,<10' }
  if ($LASTEXITCODE -eq 0) { Save-State 'pip-gpu' 'cu12-v1' } else { Say 'No se pudo instalar; se transcribe con el procesador.' }
}

$envLocal = Join-Path $Root '.env.local'
if (-not (Test-Path $envLocal)) {
  Copy-Item (Join-Path $Root '.env.example') $envLocal
  # The analysis this launcher is for: frames + our Whisper + Gemini/Claude.
  Set-EnvLine $envLocal 'ANALYSIS_ENGINE=' 'ANALYSIS_ENGINE=perception' | Out-Null
  Write-Host ''
  Write-Host '  Se creo el archivo de configuracion .env.local.' -ForegroundColor Yellow
  Write-Host '  Pon tu clave de Anthropic (ANTHROPIC_API_KEY) y/o de Gemini (GEMINI_API_KEY),' -ForegroundColor Yellow
  Write-Host '  guarda el archivo y cierralo para continuar.' -ForegroundColor Yellow
  Start-Process notepad.exe $envLocal -Wait
}

# Settings that older templates wrote and that now slow the app down:
# WHISPER_ENGINE=propio forced the NumPy Whisper (~14 min per 15 min of voice)
# over batched faster-whisper (~1.5 min). Empty means "the fast one if
# installed". Done once: whoever sets propio again afterwards keeps it.
if (Test-Changed 'env-fast-whisper' 'v1') {
  if (Set-EnvLine $envLocal 'WHISPER_ENGINE=propio' 'WHISPER_ENGINE=') { Say 'Whisper rapido activado (faster-whisper por lotes).' }
  Save-State 'env-fast-whisper' 'v1'
}

# MEDIUM was the default frame resolution until 300-frame windows at LOW
# proved to read on-screen text as well at half the tokens. Done once.
if (Test-Changed 'env-low-resolution' 'v1') {
  Set-EnvLine $envLocal 'GEMINI_MEDIA_RESOLUTION=MEDIA_RESOLUTION_MEDIUM' 'GEMINI_MEDIA_RESOLUTION=MEDIA_RESOLUTION_LOW' | Out-Null
  Save-State 'env-low-resolution' 'v1'
}

# VISION_CONCURRENCY=3 was the default until the per-minute pacing made more
# windows at once safe. Done once.
if (Test-Changed 'env-concurrency' 'v1') {
  Set-EnvLine $envLocal 'VISION_CONCURRENCY=3' 'VISION_CONCURRENCY=8' | Out-Null
  Save-State 'env-concurrency' 'v1'
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
# Something took the port while this ran (the check above was before the update).
if (Test-Port $Port) { Fail "El puerto $Port lo esta usando otro programa. Cierralo, o elige otro puerto con la variable VIDEO_ANALYZER_PORT." }
if (Test-Path $PidFile) { Remove-Item $PidFile -Force }
Start-Worker
$web = Start-Process cmd.exe -PassThru -WorkingDirectory (Join-Path $Root 'apps\web') -WindowStyle Minimized -ArgumentList '/k', "title $WebTitle & npx next start -H 127.0.0.1 -p $Port"
Add-Content -Path $PidFile -Value $web.Id

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
