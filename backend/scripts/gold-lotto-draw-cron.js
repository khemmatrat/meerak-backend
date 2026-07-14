/**
 * Gold Lotto auto-draw cron — run every 5 min near draw_at (Asia/Bangkok)
 * Usage: node backend/scripts/gold-lotto-draw-cron.js
 */
import pg from 'pg';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { tryAutoDraw } from '../lib/goldLottoService.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '..', '.env') });
dotenv.config({ path: join(__dirname, '..', '..', '.env') });

const pool = new pg.Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432', 10),
  database: process.env.DB_DATABASE || 'meera_db',
  user: process.env.DB_USER || 'meera',
  password: process.env.DB_PASSWORD || 'meera123',
  max: 3,
});

async function main() {
  try {
    const out = await tryAutoDraw(pool);
    console.log('[gold-lotto-draw-cron]', JSON.stringify(out));
    process.exit(0);
  } catch (e) {
    console.error('[gold-lotto-draw-cron] fatal:', e?.message || e);
    process.exit(1);
  } finally {
    await pool.end().catch(() => { });
  }
}

main();
