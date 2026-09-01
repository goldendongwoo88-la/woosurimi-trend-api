# Shopping Shorts daily runner (ASCII only - PS 5.1 UTF-8 issue)
# Registered as scheduled task GwShoppingShortsDaily. Manual run: this file.
$ErrorActionPreference = "Continue"
$ROOT = "C:\dev\my-project\woosurimi-trend-api"
$NODE = "C:\nodejs-portable\node-v20.15.0-win-x64\node.exe"
$LOG  = Join-Path $ROOT "logs\daily.log"

$stamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
Add-Content -Path $LOG -Value "[$stamp] start" -Encoding utf8

if (-not (Test-Path $NODE)) {
  Add-Content -Path $LOG -Value "[$stamp] ERROR node not found: $NODE" -Encoding utf8
  exit 1
}

Set-Location $ROOT
$out = & $NODE "scripts\daily.js" --want 5 2>&1 | Out-String
Add-Content -Path $LOG -Value $out -Encoding utf8

$stamp2 = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
Add-Content -Path $LOG -Value "[$stamp2] done (exit $LASTEXITCODE)" -Encoding utf8
