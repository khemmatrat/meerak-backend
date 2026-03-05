// รันเฉพาะ 042 เพื่อเพิ่ม wallet_tip event type ใน payment_ledger_audit
import pg from 'pg';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '..', '.env') });

const { Client } = pg;

async function run() {
  const client = new Client({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT, 10) || 5432,
    database: process.env.DB_DATABASE || 'meera_db',
    user: process.env.DB_USER || 'meera',
    password: process.env.DB_PASSWORD || 'meera123',
  });
  try {
    console.log('🔄 เชื่อมต่อ DB:', client.database, '@', client.host + ':' + client.port);
    await client.connect();
    const sql = await fs.readFile(path.join(__dirname, '042_wallet_tip_event.sql'), 'utf8');
    await client.query(sql);
    console.log('✅ 042_wallet_tip_event.sql รันสำเร็จ — event_type wallet_tip พร้อมใช้งาน');
  } catch (e) {
    console.error('❌', e.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}
run();
