# P56: Initialize Redis Cluster (3 nodes)
$ErrorActionPreference = "Stop"
$Root = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
$EnvFile = Join-Path $Root "infra\.env"

Write-Host "=== Start Redis cluster nodes ==="
docker compose --env-file $EnvFile -f (Join-Path $Root "docker-compose.yml") --profile dev-lite up -d redis-node-1 redis-node-2 redis-node-3
Start-Sleep -Seconds 5

Write-Host "=== Create cluster (if not exists) ==="
docker compose --env-file $EnvFile -f (Join-Path $Root "docker-compose.yml") --profile dev-lite run --rm redis:7-alpine `
  redis-cli --cluster create redis-node-1:6379 redis-node-2:6379 redis-node-3:6379 --cluster-replicas 0 --cluster-yes 2>&1

Write-Host "Set REDIS_CLUSTER=1 and REDIS_CLUSTER_ADDRS=redis-node-1:6379,redis-node-2:6379,redis-node-3:6379 on inventory-svc to enable P56."
