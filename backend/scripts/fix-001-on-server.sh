#!/bin/bash
# Run on server: bash backend/scripts/fix-001-on-server.sh
# Fixes MySQL-style inline INDEX and EXECUTE FUNCTION in migration 001

FILE="$HOME/meerak/backend/db/migrations/001_initial_schema.sql"
[ -f "$FILE" ] || FILE="backend/db/migrations/001_initial_schema.sql"

# Fix 1: notifications - remove inline INDEX, add CREATE INDEX after
perl -i -0pe 's/,\s*\n\s*INDEX idx_notifications_user_id ON notifications\(user_id\),\s*\n\s*INDEX idx_notifications_is_read ON notifications\(is_read\) WHERE is_read = FALSE,\s*\n\s*INDEX idx_notifications_created_at ON notifications\(created_at DESC\)\s*\n\s*\);/);\n\nCREATE INDEX idx_notifications_user_id ON notifications(user_id);\nCREATE INDEX idx_notifications_is_read ON notifications(is_read) WHERE is_read = FALSE;\nCREATE INDEX idx_notifications_created_at ON notifications(created_at DESC);/' "$FILE"

# Fix 2: admin_logs - remove inline INDEX, add CREATE INDEX after
perl -i -0pe 's/,\s*\n\s*INDEX idx_admin_logs_admin_id ON admin_logs\(admin_id\),\s*\n\s*INDEX idx_admin_logs_created_at ON admin_logs\(created_at DESC\),\s*\n\s*INDEX idx_admin_logs_action ON admin_logs\(action_type\)\s*\n\s*\);/);\n\nCREATE INDEX idx_admin_logs_admin_id ON admin_logs(admin_id);\nCREATE INDEX idx_admin_logs_created_at ON admin_logs(created_at DESC);\nCREATE INDEX idx_admin_logs_action ON admin_logs(action_type);/' "$FILE"

# Fix 3: EXECUTE FUNCTION -> EXECUTE PROCEDURE
sed -i 's/EXECUTE FUNCTION/EXECUTE PROCEDURE/g' "$FILE"

echo "Done. Run: node backend/scripts/run-migration.js 001 002 003 004 005 006 007 008 009 010 035"
