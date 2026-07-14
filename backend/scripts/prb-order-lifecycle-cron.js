#!/usr/bin/env node
/**
 * PRB order lifecycle — auto ship after 24h, prompt confirm after 3 days shipped.
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
  user: process.env.DB_USER || 'meera',
  password: process.env.DB_PASSWORD || '',
});

async function getFcmTokens(userId) {
  try {
    const r = await pool.query(
      `SELECT token FROM fcm_tokens WHERE user_id = $1::uuid AND token IS NOT NULL`,
      [userId]
    );
    return (r.rows || []).map((x) => x.token).filter(Boolean);
  } catch {
    return [];
  }
}

async function sendPush(userId, title, body, data = {}) {
  const tokens = await getFcmTokens(userId);
  if (!tokens.length) return;
  try {
    const { sendFcmMulticast } = await import('../lib/fcmService.js');
    await sendFcmMulticast(tokens, { title, body, data, icon: '/logo.png' });
  } catch (e) {
    console.warn('[PRB Cron] FCM failed:', e?.message || e);
  }
}

async function run() {
  try {
    const shipCandidates = await pool.query(`
      SELECT id, user_id, quote_number
      FROM aqond_prb_orders
      WHERE status = 'checking'
        AND submitted_at IS NOT NULL
        AND submitted_at <= NOW() - INTERVAL '24 hours'
    `);

    for (const row of shipCandidates.rows || []) {
      await pool.query(
        `UPDATE aqond_prb_orders
         SET status = 'processing', updated_at = NOW()
         WHERE id = $1 AND status = 'checking'`,
        [row.id]
      );
      await pool.query(
        `UPDATE aqond_prb_orders
         SET status = 'shipped', shipped_at = NOW(), policy_status = 'แจ้งงานสำเร็จ',
             updated_at = NOW()
         WHERE id = $1`,
        [row.id]
      );
      await sendPush(
        row.user_id,
        'ต่อ พ.ร.บ. เสร็จแล้ว',
        'เอกสารกำลังจัดส่งถึงบ้าน — แตะเพื่อดูสถานะ',
        { notification_type: 'prb_status', order_id: row.id, deep_link: `app://prb/track/${row.id}` }
      );
      console.log('[PRB Cron] Shipped', row.quote_number);
    }

    const promptCandidates = await pool.query(`
      SELECT id, user_id, quote_number
      FROM aqond_prb_orders
      WHERE status = 'shipped'
        AND shipped_at IS NOT NULL
        AND shipped_at <= NOW() - INTERVAL '3 days'
        AND confirmed_at IS NULL
        AND (dispute_reason IS NULL OR dispute_reason = '')
    `);

    for (const row of promptCandidates.rows || []) {
      await sendPush(
        row.user_id,
        'ยืนยันรับเอกสาร พ.ร.บ.',
        `คำสั่ง ${row.quote_number} — กรุณายืนยันว่าได้รับเอกสารแล้วหรือแจ้งปัญหา`,
        { notification_type: 'prb_confirm_prompt', order_id: row.id, deep_link: `app://prb/track/${row.id}` }
      );
      console.log('[PRB Cron] Confirm prompt', row.quote_number);
    }
  } catch (e) {
    console.error('[PRB Cron] Error:', e);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

run();
