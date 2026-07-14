#!/usr/bin/env bash
# P2b+ Bagisto Laravel + AQOND mirror
#
# Stage 1 — MySQL mirror (Publish → aqond_products via bagisto-bridge):
#   docker compose --env-file infra/.env --profile p2b-bagisto up -d bagisto-mysql bagisto-bridge marketplace-web
#   BAGISTO_APP_URL=http://bagisto-bridge:8089  (in infra/.env)
#
# Stage 2 — Full Bagisto admin/storefront (first boot 15-30 min on CPU):
#   docker compose --env-file infra/.env --profile p2b-bagisto up -d bagisto-app
#   Admin UI: http://localhost:8099  (or Kong http://localhost:8000/api/v1/bagisto-admin)
#   Default after install: admin@example.com / admin123 — rotate immediately
#
# Multi-vendor marketplace (Webkul paid module):
#   Purchase: https://bagisto.com/en/laravel-multi-vendor-marketplace/
#   docker exec -it aqond-v2-bagisto-app bash
#   composer require webkul/marketplace  # package name per your license docs
#   php artisan marketplace:install
#
# Fix legacy MySQL grants (if bridge restarts with ER_HOST_NOT_PRIVILEGED):
#   pwsh infra/scripts/fix-mysql-bagisto-grants.ps1
#
set -euo pipefail
echo "See comments above and infra/scripts/smoke-test-p2b-mirror.ps1"
