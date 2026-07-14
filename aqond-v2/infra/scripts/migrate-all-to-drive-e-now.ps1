#Requires -Version 5.1
#Requires -RunAsAdministrator
<#
.SYNOPSIS
  Move ALL AQOND + Docker workload off C: to E: (immediate disk relief).

  BEFORE running (required):
    1. Quit Docker Desktop completely (tray icon -> Quit)
    2. Close other WSL terminals

  Run (Admin PowerShell — outside Cursor if needed):
    pwsh -NoProfile -ExecutionPolicy Bypass -File "G:\meerak\aqond-v2\infra\scripts\migrate-all-to-drive-e-now.ps1"

  What it does:
    - Creates E:\aqond-data + E:\Docker layout
    - Sets User env: AQOND_DATA_ROOT, GOMODCACHE, GOCACHE, NPM cache on E:
    - Updates infra/.env + project .env
    - Points Docker Desktop WSL dir to E:\Docker\wsl
    - Exports/imports docker-desktop WSL distros to E: (images, build cache, layers)
    - Optionally removes old C:\Users\...\AppData\Local\Docker\wsl after success
#>
$ErrorActionPreference = "Stop"

$Drive = "E:"
$DataRoot = Join-Path $Drive "aqond-data"
$DockerRoot = Join-Path $Drive "Docker"
$DockerWsl = Join-Path $DockerRoot "wsl"
$Root = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
$EnvFile = Join-Path $Root "infra\.env"
$OldWsl = Join-Path $env:LOCALAPPDATA "Docker\wsl"
$SettingsFile = Join-Path $env:APPDATA "Docker\settings-store.json"

function Set-UserEnv($Name, $Value) {
  [Environment]::SetEnvironmentVariable($Name, $Value, "User")
  Set-Item -Path "env:$Name" -Value $Value
  Write-Host "  env $Name = $Value" -ForegroundColor DarkGray
}

Write-Host "=== AQOND: migrate everything to $Drive ===" -ForegroundColor Cyan

if (-not (Test-Path $Drive)) { throw "Drive $Drive not found." }

# --- 1. Data directories on E: ---
$dirs = @(
  $DataRoot, $DockerRoot, $DockerWsl,
  (Join-Path $DataRoot "postgres"),
  (Join-Path $DataRoot "ollama"),
  (Join-Path $DataRoot "n8n"),
  (Join-Path $DataRoot "minio"),
  (Join-Path $DataRoot "mysql-bagisto"),
  (Join-Path $DataRoot "bagisto-app"),
  (Join-Path $DataRoot "go-mod-cache"),
  (Join-Path $DataRoot "go-build-cache"),
  (Join-Path $DataRoot "npm-cache"),
  (Join-Path $DataRoot "tmp")
)
foreach ($d in $dirs) {
  if (-not (Test-Path $d)) {
    New-Item -ItemType Directory -Path $d -Force | Out-Null
    Write-Host "Created $d"
  }
}

# --- 2. Permanent User env (build caches off C:) ---
Write-Host "`nSetting User environment variables on E:..."
Set-UserEnv "AQOND_DATA_ROOT" ($DataRoot -replace '\\', '/')
Set-UserEnv "OLLAMA_MODELS" (Join-Path $DataRoot "ollama")
Set-UserEnv "DOCKER_DATA_ROOT" $DockerRoot
Set-UserEnv "GOMODCACHE" (Join-Path $DataRoot "go-mod-cache")
Set-UserEnv "GOCACHE" (Join-Path $DataRoot "go-build-cache")
Set-UserEnv "NPM_CONFIG_CACHE" (Join-Path $DataRoot "npm-cache")
Set-UserEnv "TMP" (Join-Path $DataRoot "tmp")
Set-UserEnv "TEMP" (Join-Path $DataRoot "tmp")

# --- 3. Update .env files ---
$pairs = @{
  "AQOND_DATA_ROOT"  = "E:/aqond-data"
  "OLLAMA_MODELS"    = "E:\aqond-data\ollama"
  "DOCKER_DATA_ROOT" = "E:\Docker"
}
if (Test-Path $EnvFile) {
  $content = Get-Content $EnvFile -Raw
  foreach ($k in $pairs.Keys) {
    if ($content -match "(?m)^$k=") {
      $content = $content -replace "(?m)^$k=.*", "$k=$($pairs[$k])"
    } else {
      $content += "`n$k=$($pairs[$k])"
    }
  }
  Set-Content -Path $EnvFile -Value $content.TrimEnd() -Encoding UTF8
  Copy-Item $EnvFile (Join-Path $Root ".env") -Force
  Write-Host "Updated infra/.env and project .env"
}

# --- 4. Docker Desktop: point WSL storage to E: ---
Write-Host "`nShutting down WSL..."
wsl --shutdown 2>$null
Start-Sleep -Seconds 4

if (Test-Path $SettingsFile) {
  $escaped = $DockerWsl -replace '\\', '\\'
  $raw = Get-Content $SettingsFile -Raw
  if ($raw -match '"CustomWslDistroDir"\s*:\s*"[^"]*"') {
    $raw = $raw -replace '"CustomWslDistroDir"\s*:\s*"[^"]*"', "`"CustomWslDistroDir`": `"$escaped`""
  } else {
    $raw = $raw.TrimEnd().TrimEnd('}') + ",`n  `"CustomWslDistroDir`": `"$escaped`"`n}"
  }
  Set-Content -Path $SettingsFile -Value $raw -Encoding UTF8
  Write-Host "Docker settings -> CustomWslDistroDir = $DockerWsl"
}

# --- 5. Move existing WSL docker data from C: to E: (export/import) ---
$distros = @("docker-desktop-data", "docker-desktop")
foreach ($name in $distros) {
  $listed = wsl -l -v 2>$null | Select-String $name
  if (-not $listed) {
    Write-Host "Skip WSL distro '$name' (not found)"
    continue
  }
  $tar = Join-Path $DockerRoot "$name.tar"
  $dest = Join-Path $DockerRoot $name
  Write-Host "`nExporting $name (this may take 10-30 min)..."
  wsl --export $name $tar
  Write-Host "Unregistering $name..."
  wsl --unregister $name
  New-Item -ItemType Directory -Path $dest -Force | Out-Null
  Write-Host "Importing $name -> $dest ..."
  wsl --import $name $dest $tar --version 2
  Remove-Item $tar -Force -ErrorAction SilentlyContinue
  Write-Host "Done: $name on E:" -ForegroundColor Green
}

# --- 6. Remove old C: WSL folder (frees the big .vhdx on C:) ---
if (Test-Path $OldWsl) {
  Write-Host "`nRemoving old Docker WSL folder on C: ($OldWsl)..."
  try {
    Remove-Item $OldWsl -Recurse -Force -ErrorAction Stop
    Write-Host "Freed C: Docker WSL folder." -ForegroundColor Green
  } catch {
    Write-Warning "Could not delete $OldWsl — delete manually after Docker starts OK: $_"
  }
}

# --- 7. Move native .ollama off C: if present ---
$NativeOllama = Join-Path $env:USERPROFILE ".ollama"
$OllamaTarget = Join-Path $DataRoot "ollama"
if ((Test-Path $NativeOllama) -and -not (Get-Item $NativeOllama -ErrorAction SilentlyContinue).LinkType) {
  Write-Host "`nMoving native .ollama to E:..."
  robocopy $NativeOllama $OllamaTarget /E /MOVE /R:2 /W:5 /NFL /NDL /NJH /NJS | Out-Null
  if ($LASTEXITCODE -lt 8) {
    Remove-Item $NativeOllama -Recurse -Force -ErrorAction SilentlyContinue
    cmd /c mklink /J "$NativeOllama" "$OllamaTarget" 2>$null
    Write-Host "Ollama junction -> E:"
  }
}

Write-Host @"

=== Migration complete ===
1. Start Docker Desktop (wait until Running)
2. Verify: Docker Desktop -> Settings -> Resources -> Disk image = E:\Docker\wsl
3. NEW terminal, then:
   cd $Root
   docker compose --env-file infra/.env --profile dev-lite up -d --build

Build caches now on E:
  GOMODCACHE  = E:\aqond-data\go-mod-cache
  GOCACHE     = E:\aqond-data\go-build-cache
  NPM cache   = E:\aqond-data\npm-cache
  Postgres/MinIO/Ollama bind mounts = E:\aqond-data\*

If C: still low, run Disk Cleanup on C: (Temp files, Windows Update Cleanup).
"@ -ForegroundColor Green
