#Requires -Version 5.1
<#
  Restart Ollama on Windows + ai-core local (fix RAM/disk crash).

  Usage:
    pwsh -File infra/scripts/restart-ollama-ai.ps1
#>
$ErrorActionPreference = "Continue"

Write-Host "=== Restart Ollama + ai-core ===" -ForegroundColor Cyan

Get-Process ollama*, "Ollama*" -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 2

$ollama = "$env:LOCALAPPDATA\Programs\Ollama\ollama app.exe"
if (Test-Path $ollama) {
  Start-Process $ollama
  Write-Host "Started Ollama app" -ForegroundColor Green
} else {
  Write-Host "Start Ollama manually from Start menu" -ForegroundColor Yellow
}

$deadline = (Get-Date).AddMinutes(2)
while ((Get-Date) -lt $deadline) {
  try {
    Invoke-RestMethod -Uri "http://127.0.0.1:11434/api/tags" -TimeoutSec 3 | Out-Null
    Write-Host "Ollama API ready" -ForegroundColor Green
    break
  } catch {
    Start-Sleep -Seconds 3
  }
}

$p = (Get-NetTCPConnection -LocalPort 8100 -State Listen -ErrorAction SilentlyContinue).OwningProcess | Select-Object -First 1
if ($p) { Stop-Process -Id $p -Force -ErrorAction SilentlyContinue; Start-Sleep -Seconds 1 }

$root = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
Start-Process pwsh -ArgumentList "-NoProfile", "-File", (Join-Path $root "infra\scripts\ai-core-local.ps1") -WindowStyle Normal
Write-Host "Started ai-core-local.ps1 in new window" -ForegroundColor Green
Write-Host "Then refresh http://localhost:3003/m/home and try camera again" -ForegroundColor Cyan
