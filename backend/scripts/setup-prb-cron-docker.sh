#!/usr/bin/env bash
# Install/remove PRB lifecycle cron on Ubuntu Docker host (aqond v12).
# Usage: bash backend/scripts/setup-prb-cron-docker.sh [install|remove|status]
set -euo pipefail

CONTAINER="${AQOND_BACKEND_CONTAINER:-aqond-backend}"
LOG_FILE="${AQOND_PRB_CRON_LOG:-/var/log/aqond-prb-lifecycle.log}"
CRON_LINE="0 * * * * docker exec ${CONTAINER} node scripts/prb-order-lifecycle-cron.js >> ${LOG_FILE} 2>&1"
MARKER="# aqond-prb-lifecycle-cron"

cmd="${1:-install}"

touch "${LOG_FILE}" 2>/dev/null || true

case "${cmd}" in
  install)
    if ! docker ps --format '{{.Names}}' | grep -qx "${CONTAINER}"; then
      echo "ERROR: container '${CONTAINER}' is not running. Start backend first."
      exit 1
    fi
    if ! docker exec "${CONTAINER}" test -f scripts/prb-order-lifecycle-cron.js; then
      echo "ERROR: scripts/prb-order-lifecycle-cron.js not found in ${CONTAINER}."
      echo "Deploy/sync backend-1.2 and rebuild image first."
      exit 1
    fi
    tmp="$(mktemp)"
    crontab -l 2>/dev/null | grep -v "${MARKER}" | grep -v "prb-order-lifecycle-cron.js" > "${tmp}" || true
    echo "${CRON_LINE} ${MARKER}" >> "${tmp}"
    crontab "${tmp}"
    rm -f "${tmp}"
    echo "Installed hourly PRB lifecycle cron:"
    echo "  ${CRON_LINE}"
    echo "Log: ${LOG_FILE}"
    ;;
  remove)
    tmp="$(mktemp)"
    crontab -l 2>/dev/null | grep -v "${MARKER}" | grep -v "prb-order-lifecycle-cron.js" > "${tmp}" || true
    crontab "${tmp}" || true
    rm -f "${tmp}"
    echo "Removed PRB lifecycle cron entries."
    ;;
  status)
    echo "=== crontab (prb) ==="
    crontab -l 2>/dev/null | grep -E "prb-order-lifecycle|${MARKER}" || echo "(none)"
    echo "=== container ==="
    docker ps --filter "name=${CONTAINER}" --format 'table {{.Names}}\t{{.Status}}'
    echo "=== script in container ==="
    docker exec "${CONTAINER}" ls -la scripts/prb-order-lifecycle-cron.js 2>/dev/null || echo "missing"
    ;;
  *)
    echo "Usage: $0 [install|remove|status]"
    exit 1
    ;;
esac
