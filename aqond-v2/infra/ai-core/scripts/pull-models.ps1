$ErrorActionPreference = "Stop"
$Root = Split-Path (Split-Path (Split-Path $PSScriptRoot -Parent) -Parent) -Parent
$EnvFile = Join-Path $Root "infra\.env"
$ComposeFile = Join-Path $Root "docker-compose.yml"

function Invoke-ComposeExec {
  param([string[]]$ComposeArgs)
  $prev = $ErrorActionPreference
  $ErrorActionPreference = "Continue"
  & docker compose --env-file $EnvFile -f $ComposeFile @ComposeArgs 2>&1 | ForEach-Object {
    if ($_ -match "level=warning") { Write-Host $_ -ForegroundColor DarkYellow }
    else { Write-Host $_ }
  }
  $code = $LASTEXITCODE
  $ErrorActionPreference = $prev
  return $code
}
Get-Content $EnvFile | ForEach-Object {
  if ($_ -match '^\s*([^#=]+)=(.*)$') {
    Set-Item -Path "env:$($matches[1].Trim())" -Value $matches[2].Trim()
  }
}

# Lite (~4GB): hermes3:3b + moondream | Standard (~9GB): hermes3:8b + llava:7b
$Profile = if ($env:OLLAMA_PROFILE) { $env:OLLAMA_PROFILE } else { "lite" }
if ($Profile -eq "standard") {
  $Chat = if ($env:OLLAMA_MODEL_CHAT) { $env:OLLAMA_MODEL_CHAT } else { "hermes3:8b" }
  $Vision = if ($env:OLLAMA_MODEL_VISION) { $env:OLLAMA_MODEL_VISION } else { "llava:7b" }
} else {
  $Chat = if ($env:OLLAMA_MODEL_CHAT) { $env:OLLAMA_MODEL_CHAT } else { "hermes3:3b" }
  $Vision = if ($env:OLLAMA_MODEL_VISION) { $env:OLLAMA_MODEL_VISION } else { "moondream" }
}

Write-Host "Profile: $Profile"
Write-Host "  chat:   $Chat"
Write-Host "  vision: $Vision"
Write-Host ""
Write-Host "Disk guide: lite ~4GB | standard ~9GB | need free space on Docker Desktop disk"
Write-Host ""

function Pull-Model($Name) {
  Write-Host ">>> ollama pull $Name"
  $code = Invoke-ComposeExec @("exec", "-T", "ollama", "ollama", "pull", $Name)
  if ($code -ne 0) {
    Write-Warning "Failed: $Name - check tag at https://ollama.com/library/hermes3"
    return $false
  }
  return $true
}
$okChat = Pull-Model $Chat
$okVision = Pull-Model $Vision

Write-Host ""
Invoke-ComposeExec @("exec", "-T", "ollama", "ollama", "list") | Out-Null
if ($okChat -and $okVision) {
  Write-Host "All models ready."
} else {
  Write-Host "Some pulls failed. Try lite profile or free Docker disk space:"
  Write-Host "  Docker Desktop -> Settings -> Resources -> Disk image size"
  Write-Host "  docker system prune -a   (removes unused images - careful)"
  exit 1
}
