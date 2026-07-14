# Query ai.inference_log in Postgres (Hermes audit trail)
param(
  [int]$Limit = 10,
  [string]$Task = "",
  [switch]$Json
)

$ErrorActionPreference = "Stop"
$Root = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
$EnvFile = Join-Path $Root "infra\.env"

Get-Content $EnvFile | ForEach-Object {
  if ($_ -match '^\s*([^#=]+)=(.*)$') {
    Set-Item -Path "env:$($matches[1].Trim())" -Value $matches[2].Trim()
  }
}

$User = if ($env:POSTGRES_USER) { $env:POSTGRES_USER } else { "admin_boss" }
$Pass = $env:POSTGRES_PASSWORD
if (-not $Pass) { throw "Set POSTGRES_PASSWORD in infra/.env" }

$where = if ($Task) { "WHERE task = '$($Task.Replace("'","''"))'" } else { "" }
$sql = @"
SELECT id, task, model, latency_ms, success, error_msg,
       metadata->>'title' AS title, created_at
FROM ai.inference_log
$where
ORDER BY created_at DESC
LIMIT $Limit;
"@

if ($Json) {
  $sql = @"
SELECT COALESCE(json_agg(row_to_json(t)), '[]'::json)
FROM (
  SELECT id, task, model, prompt_hash, latency_ms, success, error_msg, metadata, created_at
  FROM ai.inference_log
  $where
  ORDER BY created_at DESC
  LIMIT $Limit
) t;
"@
}

Push-Location $Root
try {
  $sql | docker compose --env-file $EnvFile exec -T -e "PGPASSWORD=$Pass" aqond-db `
    psql -U $User -d ai -t -A
} finally {
  Pop-Location
}
