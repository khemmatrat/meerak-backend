#!/bin/bash
set -e
# Idempotent ping + ensure bagisto@% (fixes bridge ER_HOST_NOT_PRIVILEGED on legacy volumes)

if mysqladmin ping -h 127.0.0.1 -uroot --silent 2>/dev/null; then
  ROOT_AUTH=(-uroot)
elif [ -n "${MYSQL_ROOT_PASSWORD:-}" ] && mysqladmin ping -h 127.0.0.1 -uroot -p"${MYSQL_ROOT_PASSWORD}" --silent 2>/dev/null; then
  ROOT_AUTH=(-uroot -p"${MYSQL_ROOT_PASSWORD}")
else
  exit 1
fi

mysql "${ROOT_AUTH[@]}" <<EOSQL
CREATE DATABASE IF NOT EXISTS \`${MYSQL_DATABASE}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER IF NOT EXISTS '${MYSQL_USER}'@'%' IDENTIFIED BY '${MYSQL_PASSWORD}';
ALTER USER '${MYSQL_USER}'@'%' IDENTIFIED BY '${MYSQL_PASSWORD}';
GRANT ALL PRIVILEGES ON \`${MYSQL_DATABASE}\`.* TO '${MYSQL_USER}'@'%';
FLUSH PRIVILEGES;
EOSQL

exit 0
