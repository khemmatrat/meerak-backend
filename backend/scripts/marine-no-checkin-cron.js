#!/usr/bin/env node
/**
 * Marine No-Check-In Cron
 * รันทุก 5–10 นาที: หา Marine jobs ที่ออกเรือภายใน 30 นาที แต่กัปตันยังไม่เช็คอิน
 * เรียก backup-captain-search เพื่อแจ้ง Admin
 */
import pg from 'pg';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '..', '.env') });
dotenv.config({ path: join(__dirname, '..', '..', '.env') });

const pool = new pg.Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432', 10),
  database: process.env.DB_DATABASE || process.env.DB_NAME || 'meera_db',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || '',
});

const BACKEND_URL = process.env.VITE_BACKEND_URL || process.env.BACKEND_URL || 'http://localhost:3001';

async function run() {
  try {
    const now = new Date();
    const in30 = new Date(now.getTime() + 30 * 60 * 1000);

    const rows = await pool.query(`
      SELECT id, title, datetime, accepted_by, marine_status
      FROM jobs
      WHERE category = 'Marine'
        AND status IN ('accepted', 'pending')
        AND accepted_by IS NOT NULL
        AND datetime IS NOT NULL
        AND datetime > $1
        AND datetime <= $2
        AND (marine_status IS NULL OR marine_status != 'checkin_ok')
    `, [now, in30]);

    const jobs = rows.rows || [];
    if (jobs.length === 0) {
      console.log('[Marine Cron] No jobs needing backup captain search');
      return;
    }

    for (const job of jobs) {
      try {
        const res = await fetch(`${BACKEND_URL}/api/marine/backup-captain-search`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ job_id: job.id }),
        });
        const data = await res.json();
        console.log(`[Marine Cron] Job ${job.id}: backup search →`, data.backup_captains ?? 0, 'captains');
      } catch (e) {
        console.error(`[Marine Cron] Job ${job.id} failed:`, e.message);
      }
    }
  } catch (e) {
    console.error('[Marine Cron] Error:', e);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

run();
