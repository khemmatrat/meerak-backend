#!/bin/bash
# Idempotent grants fix — run after bagisto-mysql is healthy (existing or fresh volumes)
set -euo pipefail

HOST="${MYSQL_HOST:-bagisto-mysql}"
DB="${MYSQL_DATABASE:-bagisto}"
USER="${MYSQL_USER:-bagisto}"
PASS="${MYSQL_PASSWORD:?MYSQL_PASSWORD required}"
ROOT_PASS="${MYSQL_ROOT_PASSWORD:-}"

run_sql() {
  local auth=("$@")
  mysql -h "$HOST" "${auth[@]}" -e "$SQL"
}

SQL="
CREATE DATABASE IF NOT EXISTS \`${DB}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER IF NOT EXISTS '${USER}'@'%' IDENTIFIED BY '${PASS}';
ALTER USER '${USER}'@'%' IDENTIFIED BY '${PASS}';
GRANT ALL PRIVILEGES ON \`${DB}\`.* TO '${USER}'@'%';
FLUSH PRIVILEGES;
"

echo "Waiting for MySQL at ${HOST}..."
for i in $(seq 1 90); do
  if mysqladmin ping -h "$HOST" --silent 2>/dev/null; then
    break
  fi
  sleep 2
done

# Existing aqond volumes may have root@localhost with empty password (init without env)
if run_sql -uroot 2>/dev/null; then
  echo "Applied grants (root socket/empty)"
elif [ -n "$ROOT_PASS" ] && run_sql -uroot -p"$ROOT_PASS" 2>/dev/null; then
  echo "Applied grants (root password)"
else
  echo "Could not connect as root to ${HOST}" >&2
  exit 1
fi

mysql -h "$HOST" -u"$USER" -p"$PASS" -e "SELECT 1 AS bagisto_ok" >/dev/null
echo "Verified ${USER}@% on ${DB}"
