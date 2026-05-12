/**
 * Optional: อัปเดต cash_liability_amount ใน payment_details สำหรับงานเงินสดที่ยัง **open**
 * (ยังไม่มีผู้รับงาน / ยังไม่หัก wallet) ให้สอดคล้องกับ employer outflow เต็ม (รวม markup)
 *
 * ไม่แก้งานที่ accepted แล้ว — ยอดค้ำถูกหักไปแล้ว ต้องจัดการแยก
 *
 * Usage:
 *   node backend/scripts/backfill-cash-liability-amount.js           # dry-run
 *   node backend/scripts/backfill-cash-liability-amount.js --execute
 */
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import pg from 'pg';
import { calcMatchJobEmployerOutflowDynamic } from '../lib/paymentProviderGate.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '..', '.env') });
dotenv.config({ path: join(__dirname, '..', '..', '.env') });

const { Pool } = pg;

function round2(n) {
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}

function computeTarget(pd, price) {
  const includesMarkup = pd.price_includes_payment_markup === true;
  const p = round2(parseFloat(price) || 0);
  if (p <= 0) return 0;
  if (includesMarkup) return p;
  const hasInsurance =
    pd.has_insurance === true ||
    pd.employer_wants_insurance === true ||
    pd.employer_wants_insurance === 'true';
  const jobFee = p;
  let insuranceAmount = 0;
  if (hasInsurance && jobFee > 0) insuranceAmount = round2(jobFee * 0.1);
  return calcMatchJobEmployerOutflowDynamic(jobFee, insuranceAmount).finalPrice;
}

async function main() {
  const execute = process.argv.includes('--execute');
  const pool = new Pool({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT, 10) || 5432,
    database: process.env.DB_DATABASE || 'meera_db',
    user: process.env.DB_USER || 'meera',
    password: process.env.DB_PASSWORD != null && process.env.DB_PASSWORD !== '' ? String(process.env.DB_PASSWORD) : '',
  });

  try {
    const r = await pool.query(
      `SELECT id, price, payment_details, status
       FROM jobs
       WHERE status = 'open'
         AND (payment_details->>'employer_payment_method') = 'cash'
         AND accepted_by IS NULL`
    );

    let updated = 0;
    for (const row of r.rows) {
      const pd =
        typeof row.payment_details === 'string'
          ? JSON.parse(row.payment_details || '{}')
          : row.payment_details || {};
      const current = round2(parseFloat(pd.cash_liability_amount) || 0);
      const target = computeTarget(pd, row.price);
      if (target <= 0 || Math.abs(current - target) < 0.005) continue;

      console.log(
        `[${execute ? 'APPLY' : 'dry-run'}] job ${row.id} cash_liability ${current} -> ${target} (price=${row.price})`
      );
      if (execute) {
        const merged = {
          ...pd,
          cash_liability_amount: target,
          cash_liability_currency: 'THB',
          cash_liability_backfilled_at: new Date().toISOString(),
        };
        await pool.query(
          `UPDATE jobs SET payment_details = $1::jsonb, updated_at = NOW() WHERE id::text = $2`,
          [JSON.stringify(merged), String(row.id)]
        );
        updated++;
      }
    }
    if (execute) console.log(`Done. Updated ${updated} row(s).`);
    else console.log('Dry-run only. Pass --execute to apply.');
  } finally {
    await pool.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
