// รันเฉพาะ 033 เพื่อแก้ jobs_status_check (ให้รองรับ status = 'expired')
// ใช้เมื่อยัง error: "violates check constraint jobs_status_check"
import pg from 'pg';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '..', '.env') });

const { Client } = pg;

async function run() {
  // ใช้ config เดียวกับ server.js เพื่อให้ชี้ไปที่ DB ตัวเดียวกัน
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
    const sql = await fs.readFile(path.join(__dirname, '033_jobs_status_allow_expired.sql'), 'utf8');
    await client.query(sql);
    console.log('✅ 033_jobs_status_allow_expired.sql รันสำเร็จ — ตอนนี้ jobs.status ใช้ค่า expired ได้แล้ว');
  } catch (e) {
    console.error('❌', e.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}
run();
