# Ensure bagisto MySQL user exists with host '%' (fixes ER_HOST_NOT_PRIVILEGED on bridge)
$ErrorActionPreference = "Stop"
$Root = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
$EnvFile = Join-Path $Root "infra\.env"

Get-Content $EnvFile | ForEach-Object {
  if ($_ -match '^\s*([^#=]+)=(.*)$') {
    Set-Item -Path "env:$($matches[1].Trim())" -Value $matches[2].Trim()
  }
}

$container = "aqond-v2-bagisto-mysql"
$running = docker ps --filter "name=$container" --format "{{.Names}}" 2>$null
if (-not $running) {
  Write-Host "Start MySQL first: docker compose --env-file infra/.env --profile p2b-bagisto up -d bagisto-mysql"
  exit 1
}

$db = $env:MYSQL_DATABASE
if (-not $db) { $db = "bagisto" }
$user = $env:MYSQL_USER
if (-not $user) { $user = "bagisto" }
$pass = $env:MYSQL_PASSWORD
if (-not $pass) { throw "MYSQL_PASSWORD missing in infra/.env" }

$sql = @"
CREATE DATABASE IF NOT EXISTS ``$db`` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER IF NOT EXISTS '$user'@'%' IDENTIFIED BY '$pass';
ALTER USER '$user'@'%' IDENTIFIED BY '$pass';
GRANT ALL PRIVILEGES ON ``$db``.* TO '$user'@'%';
FLUSH PRIVILEGES;
SELECT user, host FROM mysql.user WHERE user = '$user';
"@

$sql | docker exec -i $container mysql -uroot 2>$null
if ($LASTEXITCODE -ne 0 -and $env:MYSQL_ROOT_PASSWORD) {
  $sql | docker exec -i $container mysql -uroot -p"$env:MYSQL_ROOT_PASSWORD"
}
if ($LASTEXITCODE -ne 0) { throw "Could not apply MySQL grants" }
