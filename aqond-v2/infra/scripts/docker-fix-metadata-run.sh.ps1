#Requires -RunAsAdministrator
$ErrorActionPreference = 'Stop'
$DataVhdx = 'E:\Docker\wsl\disk\docker_data.vhdx'
$ShPath = 'E:\Docker\wsl\fix-metadata-full.sh'
$DockerExe = 'C:\Program Files\Docker\Docker\Docker Desktop.exe'
$LogFile = 'E:\Docker\wsl\fix-metadata-last.log'

function Write-Log([string]$Message) {
  $line = "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] $Message"
  Add-Content -LiteralPath $LogFile -Value $line
  Write-Host $Message
}

Write-Log '=== Run fix-metadata-full.sh ==='
taskkill /F /IM 'Docker Desktop.exe' /T 2>$null | Out-Null
taskkill /F /IM 'com.docker.backend.exe' /T 2>$null | Out-Null
wsl --shutdown 2>$null
Start-Sleep -Seconds 3

Write-Log 'Mounting data disk...'
$m = wsl --mount --vhd $DataVhdx --bare 2>&1 | Out-String
if ($LASTEXITCODE -ne 0 -and $m -notmatch 'ALREADY_ATTACHED|0x80040312') {
  throw "Mount failed: $m"
}

# wslpath breaks on backslashes from PowerShell — use forward slashes
$shForward = $ShPath -replace '\\', '/'
$wslSh = (wsl wslpath -a $shForward 2>&1 | Out-String).Trim()
if (-not $wslSh -or $wslSh -match 'wslpath:') { throw "wslpath failed for $ShPath -> $wslSh" }
Write-Log "Running $wslSh"
$out = wsl -d Ubuntu -u root -- bash $wslSh 2>&1
Write-Log ($out | Out-String).Trim()
if ($LASTEXITCODE -ne 0) { throw "fix-metadata-full.sh failed" }

wsl --unmount $DataVhdx | Out-Null
wsl --shutdown 2>$null
Start-Sleep -Seconds 2

Write-Log 'Starting Docker Desktop...'
Start-Process -FilePath $DockerExe

for ($i = 1; $i -le 36; $i++) {
  Start-Sleep -Seconds 10
  docker ps 2>&1 | Out-Null
  if ($LASTEXITCODE -eq 0) {
    Write-Log "Docker ready after $($i * 10)s"
    docker ps --format 'table {{.Names}}\t{{.Status}}' 2>&1 | ForEach-Object { Write-Log $_ }
    exit 0
  }
  Write-Log "[$i/36] waiting for engine..."
}
Write-Log 'Docker not ready — check UI'
exit 1
