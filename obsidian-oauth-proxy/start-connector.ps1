# Arranca el conector OAuth de Obsidian para Claude Desktop:
#  1) el servidor local (wrangler dev, con la logica OAuth + proxy)
#  2) el tunel publico de Cloudflare que lo expone a internet
# Se lanza solo al iniciar sesion en Windows (Tarea Programada "ObsidianConnector").

$ErrorActionPreference = "Continue"
$projectDir = "C:\Users\Sanmi\OneDrive\Documentos\Dropshipping\Apps de Claude\obsidian-oauth-proxy"
$logDir = Join-Path $projectDir "logs"
New-Item -ItemType Directory -Force -Path $logDir | Out-Null

$devLog = Join-Path $logDir "wrangler-dev.log"
$tunnelLog = Join-Path $logDir "cloudflared.log"
$urlFile = Join-Path $logDir "current-url.txt"

Set-Location $projectDir

# 1) Servidor local (OAuth + proxy hacia Obsidian)
Start-Process -FilePath "cmd.exe" -ArgumentList "/c","npx wrangler dev --local --port 8787" `
  -WorkingDirectory $projectDir -WindowStyle Hidden `
  -RedirectStandardOutput $devLog -RedirectStandardError "$devLog.err"

Start-Sleep -Seconds 6

# 2) Tunel publico hacia el servidor local
Start-Process -FilePath "cloudflared" -ArgumentList "tunnel --url http://127.0.0.1:8787" `
  -WorkingDirectory $projectDir -WindowStyle Hidden `
  -RedirectStandardOutput $tunnelLog -RedirectStandardError "$tunnelLog.err"

Start-Sleep -Seconds 6

# Extraer y guardar la URL publica actual
$tunnelText = Get-Content "$tunnelLog.err" -Raw -ErrorAction SilentlyContinue
if ($tunnelText -match "https://[a-zA-Z0-9\-]+\.trycloudflare\.com") {
  $matches[0] | Out-File -FilePath $urlFile -Encoding utf8 -NoNewline
}
