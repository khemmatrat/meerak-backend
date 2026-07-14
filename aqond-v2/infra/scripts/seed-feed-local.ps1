#Requires -Version 5.1
<#
  Seed TikTok feed locally — NO Docker, NO Kong, NO feed-svc.

  pwsh -File infra/scripts/seed-feed-local.ps1
  pwsh -File infra/scripts/seed-feed-local.ps1 -Videos 8
#>
param([int] $Videos = 5)

$ErrorActionPreference = 'Stop'
$Root = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
$Script = Join-Path $Root 'apps\storefront\scripts\seed-local-dev.mjs'

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  throw 'Node.js required — install from https://nodejs.org'
}

$ffmpeg = Get-Command ffmpeg -ErrorAction SilentlyContinue
$fixture = Join-Path $Root 'infra\fixtures\seed-demo.mp4'
if ($ffmpeg -and (-not (Test-Path $fixture) -or (Get-Item $fixture).Length -lt 5000)) {
  New-Item -ItemType Directory -Path (Split-Path $fixture -Parent) -Force | Out-Null
  Write-Host 'Generating seed-demo.mp4 with ffmpeg...' -ForegroundColor Cyan
  & ffmpeg -y -hide_banner -loglevel error `
    -f lavfi -i 'color=c=0xFE2C55:s=360x640:d=2' `
    -pix_fmt yuv420p -c:v libx264 -preset ultrafast $fixture
}

Write-Host '=== Seed local feed (no Docker) ===' -ForegroundColor Cyan
& node $Script --videos $Videos
