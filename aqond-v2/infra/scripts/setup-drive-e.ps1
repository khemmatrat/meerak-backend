#Requires -Version 5.1
<#
.SYNOPSIS
  Move AQOND v2 data + Ollama models to drive E: and set Windows environment variables.

  Run AFTER quitting Docker Desktop (recommended):
    powershell -ExecutionPolicy Bypass -File infra/scripts/setup-drive-e.ps1

  Then move Docker virtual disk (optional, frees ~22GB on C:):
    powershell -ExecutionPolicy Bypass -File infra/scripts/move-docker-disk-to-e.ps1
#>
$ErrorActionPreference = "Stop"

$Drive = "E:"
$DataRoot = Join-Path $Drive "aqond-data"
$DockerRoot = Join-Path $Drive "Docker"
$Root = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
$EnvFile = Join-Path $Root "infra\.env"
$NativeOllama = Join-Path $env:USERPROFILE ".ollama"
$OllamaTarget = Join-Path $DataRoot "ollama"

Write-Host "=== AQOND: setup data on $Drive ===" -ForegroundColor Cyan

if (-not (Test-Path $Drive)) {
  throw "Drive $Drive not found. Change `$Drive in this script if needed."
}

$dirs = @(
  $DataRoot,
  $DockerRoot,
  (Join-Path $DataRoot "postgres"),
  (Join-Path $DataRoot "ollama"),
  (Join-Path $DataRoot "n8n"),
  (Join-Path $DataRoot "bagisto"),
  (Join-Path $DataRoot "minio")
)
foreach ($d in $dirs) {
  if (-not (Test-Path $d)) {
    New-Item -ItemType Directory -Path $d -Force | Out-Null
    Write-Host "Created $d"
  }
}

# --- Windows User environment variables (permanent) ---
function Set-UserEnv($Name, $Value) {
  [Environment]::SetEnvironmentVariable($Name, $Value, "User")
  Set-Item -Path "env:$Name" -Value $Value
  Write-Host "  env $Name = $Value"
}

Write-Host "`nSetting User environment variables..."
Set-UserEnv "AQOND_DATA_ROOT" ($DataRoot -replace '\\', '/')
Set-UserEnv "OLLAMA_MODELS" $OllamaTarget
Set-UserEnv "DOCKER_DATA_ROOT" $DockerRoot

# --- Move native Ollama (~16GB on C:) into E:\aqond-data\ollama ---
if (Test-Path $NativeOllama) {
  Write-Host "`nMoving native .ollama -> $OllamaTarget (may take several minutes)..."
  robocopy $NativeOllama $OllamaTarget /E /MOVE /R:2 /W:5 /NFL /NDL /NJH /NJS | Out-Null
  if ($LASTEXITCODE -ge 8) {
    Write-Warning "robocopy exit $LASTEXITCODE - verify files in $OllamaTarget"
  } else {
    Write-Host "Native Ollama moved to E:"
  }
  if (Test-Path $NativeOllama) {
    Remove-Item $NativeOllama -Recurse -Force -ErrorAction SilentlyContinue
  }
  if (-not (Test-Path $NativeOllama)) {
    cmd /c mklink /J "$NativeOllama" "$OllamaTarget" 2>$null
    if ($LASTEXITCODE -eq 0) {
      Write-Host "Junction: $NativeOllama -> $OllamaTarget"
    }
  }
} else {
  Write-Host "`nNo $NativeOllama - skip native Ollama move."
}

# --- Update infra/.env ---
if (Test-Path $EnvFile) {
  $content = Get-Content $EnvFile -Raw
  $pairs = @{
    "AQOND_DATA_ROOT" = "E:/aqond-data"
    "OLLAMA_MODELS"   = "E:\aqond-data\ollama"
    "DOCKER_DATA_ROOT" = "E:\Docker"
  }
  foreach ($k in $pairs.Keys) {
    if ($content -match "(?m)^$k=") {
      $content = $content -replace "(?m)^$k=.*", "$k=$($pairs[$k])"
    } else {
      $content += "`n$k=$($pairs[$k])"
    }
  }
  Set-Content -Path $EnvFile -Value $content.TrimEnd() -Encoding UTF8
  Copy-Item $EnvFile (Join-Path $Root ".env") -Force
  Write-Host "`nUpdated $EnvFile and .env"
}

Write-Host @"

=== Done ===
Data folders on E:
  $DataRoot\postgres   - Postgres
  $DataRoot\ollama      - Ollama models (Docker + native)
  $DataRoot\n8n         - n8n
  $DataRoot\bagisto      - marketplace

Environment (User):
  AQOND_DATA_ROOT = E:/aqond-data
  OLLAMA_MODELS   = E:\aqond-data\ollama
  DOCKER_DATA_ROOT = E:\Docker

NEXT STEPS:
1. Restart terminal (or log off) so env vars apply.
2. Docker Desktop -> Settings -> Resources -> Disk image location -> E:\Docker
   (Or run: infra/scripts/move-docker-disk-to-e.ps1 as Administrator)
3. Open NEW PowerShell, then:
   cd $Root
   docker compose --env-file infra/.env up -d
   powershell -ExecutionPolicy Bypass -File infra/ai-core/scripts/pull-models.ps1

Old Docker volumes on C: (aqond-v2_postgres_data etc.) can be removed after confirming E: works:
   docker volume rm aqond-v2_postgres_data aqond-v2_ollama_data aqond-v2_n8n_data aqond-v2_bagisto_data
"@ -ForegroundColor Green
