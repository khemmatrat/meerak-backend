// Run migration 043: talent_offers + bids (AQOND Bidding System)
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
    database: process.env.DB_DATABASE || process.env.DB_NAME || 'meera_db',
    user: process.env.DB_USER || 'meera',
    password: process.env.DB_PASSWORD || 'meera123',
  });
  try {
    console.log('🔄 Running migration 043...');
    await client.connect();
    const sql = await fs.readFile(path.join(__dirname, '043_talent_offers_and_bids.sql'), 'utf8');
    await client.query(sql);
    console.log('✅ 043_talent_offers_and_bids.sql — AQOND Bidding tables ready');
  } catch (e) {
    console.error('❌', e.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}
run();
