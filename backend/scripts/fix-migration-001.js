#!/usr/bin/env node
/**
 * Fix migration 001 on the server - fixes MySQL-style INDEX and EXECUTE FUNCTION.
 * Run from project root: node backend/scripts/fix-migration-001.js
 */
import { readFileSync, writeFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const filePath = join(__dirname, "..", "db", "migrations", "001_initial_schema.sql");

let sql = readFileSync(filePath, "utf8");
let changed = false;

// Fix 1: Remove inline INDEX from notifications, add as separate CREATE INDEX
// (inline = "    INDEX idx_..." inside CREATE TABLE, not "CREATE INDEX idx_...")
if (sql.includes("\n    INDEX idx_notifications_user_id ON notifications(user_id)")) {
  sql = sql.replace(
    /,(\s*\n\s*INDEX idx_notifications_user_id ON notifications\(user_id\),\s*\n\s*INDEX idx_notifications_is_read ON notifications\(is_read\) WHERE is_read = FALSE,\s*\n\s*INDEX idx_notifications_created_at ON notifications\(created_at DESC\)\s*\n)\s*\);/,
    "\n);\n\nCREATE INDEX idx_notifications_user_id ON notifications(user_id);\nCREATE INDEX idx_notifications_is_read ON notifications(is_read) WHERE is_read = FALSE;\nCREATE INDEX idx_notifications_created_at ON notifications(created_at DESC);"
  );
  changed = true;
}

// Fix 2: Remove inline INDEX from admin_logs, add as separate CREATE INDEX
if (sql.includes("\n    INDEX idx_admin_logs_admin_id ON admin_logs(admin_id)")) {
  sql = sql.replace(
    /,(\s*\n\s*INDEX idx_admin_logs_admin_id ON admin_logs\(admin_id\),\s*\n\s*INDEX idx_admin_logs_created_at ON admin_logs\(created_at DESC\),\s*\n\s*INDEX idx_admin_logs_action ON admin_logs\(action_type\)\s*\n)\s*\);/,
    "\n);\n\nCREATE INDEX idx_admin_logs_admin_id ON admin_logs(admin_id);\nCREATE INDEX idx_admin_logs_created_at ON admin_logs(created_at DESC);\nCREATE INDEX idx_admin_logs_action ON admin_logs(action_type);"
  );
  changed = true;
}

// Fix 3: EXECUTE FUNCTION -> EXECUTE PROCEDURE (PostgreSQL 10 compat)
if (sql.includes("EXECUTE FUNCTION")) {
  sql = sql.replace(/EXECUTE FUNCTION/g, "EXECUTE PROCEDURE");
  changed = true;
}

if (changed) {
  writeFileSync(filePath, sql);
  console.log("✅ Fixed 001_initial_schema.sql - run migration again");
} else {
  console.log("ℹ️  File already fixed or has different structure - check manually");
}
