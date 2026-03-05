// รันเฉพาะ 078 สร้างตาราง security_anomalies (5 ธงแดงมหาประลัย)
import pg from 'pg';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '..', '..', '.env') });

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
    const sql = await fs.readFile(path.join(__dirname, '078_security_anomalies.sql'), 'utf8');
    await client.query(sql);
    console.log('✅ 078_security_anomalies.sql รันสำเร็จ — ตาราง security_anomalies พร้อมใช้งาน (5 ธงแดง)');
  } catch (e) {
    console.error('❌', e.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}
run();
