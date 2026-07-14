#Requires -Version 5.1
<#
  Repair containerd bbolt corruption while keeping image layers on docker_data.vhdx.

  Usage:
    pwsh -ExecutionPolicy Bypass -File infra/scripts/docker-fix-metadata.ps1
#>
$ErrorActionPreference = 'Stop'

if (-not ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole(
    [Security.Principal.WindowsBuiltInRole]::Administrator)) {
  Write-Host 'Elevating to Administrator...' -ForegroundColor Yellow
  Start-Process pwsh -Verb RunAs -ArgumentList @(
    '-ExecutionPolicy', 'Bypass', '-NoProfile', '-File', $PSCommandPath
  )
  exit 0
}

$DockerExe = 'C:\Program Files\Docker\Docker\Docker Desktop.exe'
$DataVhdx = 'E:\Docker\wsl\disk\docker_data.vhdx'
$LogFile = 'E:\Docker\wsl\fix-metadata-last.log'
$Stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$ShPath = 'E:\Docker\wsl\fix-metadata.sh'

function Write-Log([string]$Message) {
  $line = "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] $Message"
  Add-Content -LiteralPath $LogFile -Value $line
  Write-Host $Message
}

Write-Log '=== Fix containerd metadata (keep image layers) ==='

if (-not (Test-Path -LiteralPath $DataVhdx)) {
  throw "Missing $DataVhdx"
}

Write-Log 'Stopping Docker...'
taskkill /F /IM 'Docker Desktop.exe' /T 2>$null | Out-Null
taskkill /F /IM 'com.docker.backend.exe' /T 2>$null | Out-Null
taskkill /F /IM 'com.docker.build.exe' /T 2>$null | Out-Null
wsl --shutdown 2>$null
Start-Sleep -Seconds 4

Write-Log 'Mounting data disk in WSL...'
$m = wsl --mount --vhd $DataVhdx --bare 2>&1
if ($LASTEXITCODE -ne 0) { throw "Mount failed: $m" }

@'
#!/bin/bash
set -euo pipefail
DISK=""
for d in /dev/sdd /dev/sdf /dev/sdg /dev/sdh; do
  if [ -b "$d" ] && blkid "$d" 2>/dev/null | grep -q ext4; then
    DISK="$d"
    break
  fi
done
if [ -z "$DISK" ]; then
  DISK=$(lsblk -ndo NAME,FSTYPE | awk '$2=="ext4" && $1!="sde" {print "/dev/"$1; exit}')
fi
mkdir -p /mnt/dd
mount "$DISK" /mnt/dd
echo "Mounted $DISK"
test -d /mnt/dd/data/desktop-containerd

BAK="/mnt/dd/metadata-bak-STAMP"
mkdir -p "$BAK"

backup_and_remove() {
  local f="$1"
  if [ -f "$f" ]; then
    rel="${f#/mnt/dd/}"
    mkdir -p "$BAK/$(dirname "$rel")"
    cp -a "$f" "$BAK/$rel"
    rm -f "$f"
    echo "reset: $rel"
  fi
}

backup_and_remove /mnt/dd/data/desktop-containerd/daemon/io.containerd.metadata.v1.bolt/meta.db
backup_and_remove /mnt/dd/data/desktop-containerd/daemon/io.containerd.snapshotter.v1.overlayfs/metadata.db
backup_and_remove /mnt/dd/data/docker/buildkit/containerd-overlayfs/metadata_v2.db
backup_and_remove /mnt/dd/data/docker/buildkit/cache.db
backup_and_remove /mnt/dd/data/docker/buildkit/history_c8d.db
backup_and_remove /mnt/dd/data/docker/volumes/metadata.db
backup_and_remove /mnt/dd/data/docker/network/files/local-kv.db
backup_and_remove /mnt/dd/data/containerd-stargz-grpc/snapshotter/metadata.db

du -sh /mnt/dd/data/desktop-containerd/daemon/io.containerd.content.v1.content || true
sync
umount /mnt/dd
echo DONE
'@ -replace 'STAMP', $Stamp | Set-Content -LiteralPath $ShPath -Encoding UTF8NoBOM

$wslSh = (wsl wslpath -a $ShPath).Trim()
$out = wsl -d Ubuntu -u root -- bash $wslSh 2>&1
Write-Log ($out | Out-String).Trim()
if ($LASTEXITCODE -ne 0) { throw "WSL fix failed: $out" }

wsl --unmount $DataVhdx | Out-Null
wsl --shutdown 2>$null
Start-Sleep -Seconds 2

Write-Log 'Starting Docker Desktop...'
Start-Process -FilePath $DockerExe

Write-Log 'Waiting up to 5 minutes for docker ps...'
for ($i = 1; $i -le 30; $i++) {
  Start-Sleep -Seconds 10
  $dockerOut = docker ps 2>&1
  if ($LASTEXITCODE -eq 0) {
    Write-Log "SUCCESS after $($i * 10)s"
    Write-Log (($dockerOut | Out-String).Trim())
    $images = docker images 2>&1
    Write-Log (($images | Out-String).Trim())
    exit 0
  }
  Write-Log "[$i/30] waiting..."
}

Write-Log 'Docker not ready yet — check Docker Desktop UI'
exit 1
