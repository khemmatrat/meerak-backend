#Requires -Version 5.1
<#
  SSH tunnels from Windows laptop → Linux dev server running aqond-v2.

  On the Linux server (once):
    cd /path/to/aqond-v2
    bash infra/scripts/dev-remote-up.sh

  On Windows (this script — keeps running until Ctrl+C):
    pwsh -File infra/scripts/dev-remote-tunnel.ps1 -RemoteHost user@147.50.231.183
    pwsh -File infra/scripts/dev-remote-tunnel.ps1 -RemoteHost user@vps -LocalOnly

  Then on Windows use the same URLs as local dev:
    Kong API:     http://127.0.0.1:8000
    Storefront:   pwsh -File infra/scripts/storefront-dev.ps1  (UI still local)
    Postgres:     127.0.0.1:5433
    MinIO:        http://127.0.0.1:9000
    Redpanda UI:  http://127.0.0.1:8088
    ai-core:      run ai-core-local.ps1 locally OR tunnel :8100 from server

  Requires OpenSSH client (Windows 10+): ssh -V
#>
param(
  [Parameter(Mandatory = $true)]
  [Alias("RemoteHost", "Host")]
  [string] $Server,

  [int] $SshPort = 22,

  [switch] $LocalOnly
)

$ErrorActionPreference = "Stop"

if (-not (Get-Command ssh -ErrorAction SilentlyContinue)) {
  throw "OpenSSH not found. Install 'OpenSSH Client' in Windows Optional Features."
}

$tunnels = @(
  @{ Local = 8000; Remote = 8000; Name = "Kong API" },
  @{ Local = 5433; Remote = 5433; Name = "Postgres" },
  @{ Local = 6379; Remote = 6379; Name = "Redis" },
  @{ Local = 9000; Remote = 9000; Name = "MinIO API" },
  @{ Local = 9001; Remote = 9001; Name = "MinIO Console" },
  @{ Local = 8088; Remote = 8088; Name = "Redpanda Console" },
  @{ Local = 8098; Remote = 8098; Name = "CDN edge" },
  @{ Local = 8100; Remote = 8100; Name = "ai-core (if on server)" }
)

Write-Host "=== AQOND v2 remote dev tunnels ===" -ForegroundColor Cyan
Write-Host "Server: ${Server}:$SshPort" -ForegroundColor DarkGray
foreach ($t in $tunnels) {
  Write-Host ("  localhost:{0,-5} -> remote:{1,-5}  ({2})" -f $t.Local, $t.Remote, $t.Name) -ForegroundColor DarkGray
}
Write-Host ""
Write-Host "Press Ctrl+C to close tunnels." -ForegroundColor Yellow

$forwardArgs = @("-N", "-p", "$SshPort")
foreach ($t in $tunnels) {
  $forwardArgs += "-L", "$($t.Local):127.0.0.1:$($t.Remote)"
}

if ($LocalOnly) {
  Write-Host "LocalOnly: tunnels only — start storefront + ai-core on this machine." -ForegroundColor DarkGray
  Write-Host "  pwsh -File infra/scripts/storefront-dev.ps1" -ForegroundColor DarkGray
  Write-Host "  pwsh -File infra/scripts/ai-core-local.ps1" -ForegroundColor DarkGray
}

& ssh @forwardArgs $Server
