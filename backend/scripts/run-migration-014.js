/**
 * รัน migration 014 (Audit Log table — JSONB changes, actor_role, status)
 * ใช้ DATABASE_URL จาก root .env
 * รันจากโฟลเดอร์ backend: node scripts/run-migration-014.js
 */
import pg from 'pg';
import dotenv from 'dotenv';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { join, dirname } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, '..', '..');
dotenv.config({ path: join(rootDir, '.env') });

const DATABASE_URL = process.env.DATABASE_URL || (() => {
  const h = process.env.DB_HOST || 'localhost';
  const p = process.env.DB_PORT || '5432';
  const d = process.env.DB_DATABASE || 'meera_db';
  const u = process.env.DB_USER || 'meera';
  const pw = process.env.DB_PASSWORD || 'meera123';
  return `postgresql://${u}:${encodeURIComponent(pw)}@${h}:${p}/${d}`;
})();

const sqlPath = join(__dirname, '../../db/migrations/014_audit_log_schema.sql');
const sql = readFileSync(sqlPath, 'utf8');

const client = new pg.Client({ connectionString: DATABASE_URL });

async function run() {
  try {
    await client.connect();
    console.log('✅ เชื่อมต่อ DB สำเร็จ');
    await client.query(sql);
    console.log('✅ รัน migration 014_audit_log_schema.sql เสร็จแล้ว');
  } catch (err) {
    console.error('❌ Error:', err.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

run();
