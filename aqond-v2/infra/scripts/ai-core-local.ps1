#Requires -Version 5.1
<#
  Run ai-core on Windows host (bypass Docker) — uses native Ollama on :11434.

  Use when Docker bucket error blocks ollama/ai-core containers.
  Pair with storefront-dev.ps1 (sets AI_CORE_DIRECT_URL automatically).

  Terminal 1:
    pwsh -File infra/scripts/ai-core-local.ps1

  Terminal 2:
    pwsh -File infra/scripts/storefront-dev.ps1

  Models (auto-detected from ollama list, or override in infra/.env):
    OLLAMA_MODEL_CHAT   — default qwen2.5:7b-instruct
    OLLAMA_MODEL_VISION — default qwen2.5vl:3b
#>
param(
  [switch] $Install,
  [int] $Port = 8100
)

$ErrorActionPreference = "Stop"
$Root = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
$AiCore = Join-Path $Root "infra\ai-core"
$EnvFile = Join-Path $Root "infra\.env"

if (-not (Test-Path $AiCore)) { throw "Not found: $AiCore" }

Get-Content $EnvFile | ForEach-Object {
  if ($_ -match '^\s*#' -or $_ -match '^\s*$') { return }
  if ($_ -match '^\s*([^=]+)=(.*)$') {
    Set-Item -Path "env:$($matches[1].Trim())" -Value $matches[2].Trim().Trim('"').Trim("'")
  }
}

$env:PORT = "$Port"
$env:OLLAMA_HOST = if ($env:OLLAMA_HOST -and $env:OLLAMA_HOST -notmatch 'ollama:') { $env:OLLAMA_HOST } else { "http://127.0.0.1:11434" }
$env:PGHOST = "127.0.0.1"
$env:PGPORT = "5433"
$env:PGUSER = if ($env:POSTGRES_USER) { $env:POSTGRES_USER } else { "admin_boss" }
$env:PGPASSWORD = $env:POSTGRES_PASSWORD
$env:PGDATABASE = "ai"
$env:AQOND_ENV = "development"
$env:OLLAMA_TIMEOUT_MS = if ($env:OLLAMA_TIMEOUT_MS) { $env:OLLAMA_TIMEOUT_MS } else { "540000" }

# Prefer models installed in native Ollama (Windows host)
try {
  $tags = Invoke-RestMethod -Uri "$($env:OLLAMA_HOST)/api/tags" -TimeoutSec 5
  $names = @($tags.models | ForEach-Object { $_.name })
  $pick = {
    param($preferred, [string[]]$fallbacks)
    foreach ($c in @($preferred) + $fallbacks) {
      if ($c -and ($names -contains $c)) { return $c }
    }
    return $names[0]
  }
  $env:OLLAMA_MODEL_CHAT = & $pick $env:OLLAMA_MODEL_CHAT @("qwen2.5:7b-instruct", "llama3:8b", "hermes3:3b")
  $env:OLLAMA_MODEL_VISION = & $pick $env:OLLAMA_MODEL_VISION @("qwen2.5vl:3b", "llava:7b", "moondream")
  # Single vision model = less RAM on Windows (avoid loading 7B after 3B VL)
  if ($env:OLLAMA_SINGLE_MODEL -ne "0") {
    $env:OLLAMA_MODEL_CHAT = $env:OLLAMA_MODEL_VISION
  }
} catch {
  if (-not $env:OLLAMA_MODEL_CHAT) { $env:OLLAMA_MODEL_CHAT = "qwen2.5:7b-instruct" }
  if (-not $env:OLLAMA_MODEL_VISION) { $env:OLLAMA_MODEL_VISION = "qwen2.5vl:3b" }
}

Write-Host "=== ai-core (local host) ===" -ForegroundColor Cyan
Write-Host "  PORT:        $Port" -ForegroundColor DarkGray
Write-Host "  OLLAMA:      $($env:OLLAMA_HOST)" -ForegroundColor DarkGray
Write-Host "  CHAT model:  $($env:OLLAMA_MODEL_CHAT)" -ForegroundColor DarkGray
Write-Host "  VISION:      $($env:OLLAMA_MODEL_VISION)" -ForegroundColor DarkGray
Write-Host "  Postgres:    $($env:PGHOST):$($env:PGPORT)/ai" -ForegroundColor DarkGray

try {
  $tags = Invoke-RestMethod -Uri "$($env:OLLAMA_HOST)/api/tags" -TimeoutSec 5
  $names = @($tags.models | ForEach-Object { $_.name })
  Write-Host "  Ollama models: $($names -join ', ')" -ForegroundColor Green
  if ($env:OLLAMA_MODEL_CHAT -notin $names) {
    Write-Warning "Chat model '$($env:OLLAMA_MODEL_CHAT)' not in ollama list — run: ollama pull $($env:OLLAMA_MODEL_CHAT)"
  }
  if ($env:OLLAMA_MODEL_VISION -notin $names) {
    Write-Warning "Vision model '$($env:OLLAMA_MODEL_VISION)' not in ollama list — run: ollama pull $($env:OLLAMA_MODEL_VISION)"
  }
} catch {
  Write-Warning "Ollama not reachable at $($env:OLLAMA_HOST) — start Ollama app first"
}

Push-Location $AiCore
try {
  if ($Install -or -not (Test-Path "node_modules")) {
    Write-Host "`nnpm install..." -ForegroundColor Cyan
    npm install
  }
  Write-Host "`nStarting ai-core (Ctrl+C to stop)..." -ForegroundColor Green
  Write-Host "Health: http://127.0.0.1:${Port}/health" -ForegroundColor DarkGray
  node server.js
} finally {
  Pop-Location
}
