/**
 * รับ/ใช้วอเชอร์โค้ดส่วนลดจากแบนเนอร์ — ผูกกับ discount_promo_fund + payment_ledger_audit
 * รองรับ: ลดเป็น % (มีเพดานบาท), เติมเงินสะสมขั้นต่ำก่อนรับโค้ด, ใช้ได้เฉพาะงานจ้างที่ชำระครั้งแรก,
 * ช่วงเวลาโค้ด (promo_valid_* / fallback วันแบนเนอร์), จำกัดหมวดงาน
 */
import { debitDiscountPromoFundWithClient } from './discountPromoFund.js';
import { getEffectivePromoWindow } from './homeBanners.js';

function round2(n) {
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isUuid(s) {
  return typeof s === 'string' && UUID_RE.test(s.trim());
}

function normMode(row) {
  return row?.discount_mode === 'percent' ? 'percent' : 'fixed_baht';
}

function voucherAllowedCats(row) {
  const a = row?.allowed_job_categories;
  if (!a || !Array.isArray(a) || a.length === 0) return null;
  const out = a.map((s) => String(s || '').trim()).filter(Boolean);
  return out.length ? out : null;
}

function categoryAllowed(allowedArr, jobCategory) {
  if (!allowedArr || !Array.isArray(allowedArr) || allowedArr.length === 0) return true;
  const j = String(jobCategory || '')
    .trim()
    .toLowerCase();
  return allowedArr.some((c) => String(c || '').trim().toLowerCase() === j);
}

function rowToVoucher(row) {
  if (!row) return null;
  const mode = normMode(row);
  return {
    id: row.id,
    userId: String(row.user_id),
    bannerId: row.banner_id,
    promoCode: row.promo_code,
    maxDiscountBaht: round2(parseFloat(row.max_discount_baht) || 0),
    remainingBaht: round2(parseFloat(row.remaining_baht) || 0),
    claimedAt: row.claimed_at ? new Date(row.claimed_at).toISOString() : null,
    expiresAt: row.expires_at ? new Date(row.expires_at).toISOString() : null,
    discountMode: mode,
    discountPercent:
      mode === 'percent' && row.discount_percent != null
        ? round2(Math.min(100, Math.max(0, parseFloat(row.discount_percent))))
        : null,
    firstPaidJobOnly: row.first_paid_job_only === true,
    allowedJobCategories: voucherAllowedCats(row),
    /** จาก JOIN home_banners — ระงับรับ/ใช้โค้ดแบบเรียลไทม์ */
    promoClaimsEnabled:
      row.banner_promo_claims_enabled === undefined
        ? true
        : row.banner_promo_claims_enabled !== false,
  };
}

function parseFundBalance(raw) {
  if (!raw) return 0;
  try {
    const j = JSON.parse(String(raw));
    return round2(Math.max(0, Math.min(1e12, parseFloat(j.balance_thb) || 0)));
  } catch {
    return 0;
  }
}

/**
 * ยอดเติมเงินสะสม (ledger wallet_deposit ที่ completed)
 * @param {import('pg').Pool|import('pg').PoolClient} q
 */
export async function getCumulativeWalletDepositThb(q, userId) {
  const uid = String(userId || '').trim();
  if (!isUuid(uid)) return 0;
  const r = await q.query(
    `SELECT COALESCE(SUM(COALESCE(net_amount, amount)), 0)::numeric AS total
     FROM payment_ledger_audit
     WHERE (user_id)::text = $1::text
       AND event_type = 'wallet_deposit'
       AND status = 'completed'`,
    [uid]
  );
  return round2(Math.max(0, parseFloat(r.rows?.[0]?.total || 0)));
}

/**
 * จำนวนงานที่ผู้จ้างชำระแล้ว (ไม่นับ jobId ปัจจุบัน)
 * @param {import('pg').Pool|import('pg').PoolClient} q
 */
export async function countEmployerPaidJobsExcluding(q, userId, excludeJobId) {
  const uid = String(userId || '').trim();
  const ex = excludeJobId ? String(excludeJobId).trim() : '';
  const r = await q.query(
    `SELECT COUNT(*)::int AS c
     FROM jobs
     WHERE created_by::uuid = $1::uuid
       AND COALESCE(payment_status, '') = 'paid'
       AND ($2::text = '' OR id::text <> $2::text)`,
    [uid, ex]
  );
  return Math.max(0, parseInt(r.rows?.[0]?.c || '0', 10) || 0);
}

/**
 * คำนวณส่วนลดที่ใช้ได้จากราคางาน (ฝั่งเซิร์ฟเวอร์เป็นหลัก)
 */
export function computePromoDiscountThb(voucherRow, jobPriceThb) {
  const price = round2(Math.max(0, parseFloat(jobPriceThb) || 0));
  const rem = round2(parseFloat(voucherRow.remaining_baht) || 0);
  const maxCap = round2(parseFloat(voucherRow.max_discount_baht) || 0);
  const mode = normMode(voucherRow);
  if (rem <= 0 || price <= 0) return 0;
  if (mode === 'percent') {
    const pct = round2(Math.min(100, Math.max(0, parseFloat(voucherRow.discount_percent) || 0)));
    const raw = round2((price * pct) / 100);
    return Math.min(rem, maxCap, raw, price);
  }
  return Math.min(rem, maxCap, price);
}

/**
 * @param {import('pg').Pool} pool
 * @param {{ userId: string, code: string, promoEnabled?: boolean }} args
 */
export async function claimPromoVoucher(pool, { userId, code, promoEnabled = true }) {
  if (promoEnabled === false) {
    const err = new Error('promo_disabled');
    err.code = 'PROMO_DISABLED';
    throw err;
  }
  const pc = String(code || '')
    .trim()
    .toUpperCase();
  const uid = String(userId || '').trim();
  if (!pc) {
    const err = new Error('code_required');
    err.code = 'CODE_REQUIRED';
    throw err;
  }
  if (!isUuid(uid)) {
    const err = new Error('invalid_user_id');
    err.code = 'INVALID_USER_ID';
    throw err;
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const bRes = await client.query(
      `SELECT * FROM home_banners WHERE UPPER(TRIM(promo_code)) = $1 AND is_active = TRUE`,
      [pc]
    );
    const bannerRow = bRes.rows?.[0];
    if (!bannerRow) {
      await client.query('ROLLBACK');
      return { ok: false, error: 'not_found' };
    }

    if (bannerRow.promo_claims_enabled === false) {
      await client.query('ROLLBACK');
      return { ok: false, error: 'promo_claims_paused' };
    }

    const { from: promoFrom, until: promoUntil } = getEffectivePromoWindow(bannerRow);
    const now = new Date();
    if (promoFrom && now < promoFrom) {
      await client.query('ROLLBACK');
      return { ok: false, error: 'not_started' };
    }
    if (promoUntil && now > promoUntil) {
      await client.query('ROLLBACK');
      return { ok: false, error: 'expired' };
    }

    const maxBaht = round2(Math.max(0, parseFloat(bannerRow.discount_max_baht) || 0));
    if (maxBaht <= 0) {
      await client.query('ROLLBACK');
      return { ok: false, error: 'no_discount' };
    }

    const minTop = round2(Math.max(0, parseFloat(bannerRow.min_cumulative_topup_thb) || 0));
    if (minTop > 0) {
      const dep = await getCumulativeWalletDepositThb(client, uid);
      if (dep < minTop) {
        await client.query('ROLLBACK');
        return {
          ok: false,
          error: 'min_topup_not_met',
          required_thb: minTop,
          current_thb: dep,
        };
      }
    }

    const fundR = await client.query(
      `SELECT value FROM system_settings WHERE key = 'discount_promo_fund' FOR UPDATE`
    );
    const fundBal = parseFundBalance(fundR.rows?.[0]?.value);
    if (fundBal < maxBaht) {
      await client.query('ROLLBACK');
      return {
        ok: false,
        error: 'insufficient_promo_budget',
        balance_thb: fundBal,
        required_thb: maxBaht,
      };
    }

    const id = `V${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    const expiresAt = promoUntil ? promoUntil.toISOString() : null;
    const allowedCats = voucherAllowedCats(bannerRow);

    const dm = normMode(bannerRow);
    const dcp =
      bannerRow.discount_percent != null
        ? Math.max(0, Math.min(100, parseFloat(bannerRow.discount_percent)))
        : null;
    const fpj = bannerRow.first_paid_job_only === true;

    const ins = await client.query(
      `INSERT INTO user_promo_vouchers (
         id, user_id, banner_id, promo_code, max_discount_baht, remaining_baht, expires_at,
         discount_mode, discount_percent, first_paid_job_only, allowed_job_categories
       )
       VALUES ($1, $2::uuid, $3, $4, $5, $5, $6, $7, $8, $9, $10)
       ON CONFLICT (user_id, promo_code) DO NOTHING
       RETURNING *`,
      [
        id,
        uid,
        bannerRow.id,
        pc,
        maxBaht,
        expiresAt ? new Date(expiresAt) : null,
        dm,
        dm === 'percent' ? dcp : null,
        fpj,
        allowedCats,
      ]
    );

    if (!ins.rows?.[0]) {
      await client.query('ROLLBACK');
      const ex = await pool.query(
        `SELECT * FROM user_promo_vouchers WHERE user_id = $1::uuid AND promo_code = $2`,
        [uid, pc]
      );
      return {
        ok: false,
        error: 'already_claimed',
        voucher: rowToVoucher(ex.rows?.[0]),
      };
    }

    await client.query('COMMIT');
    return { ok: true, voucher: rowToVoucher(ins.rows[0]) };
  } catch (e) {
    await client.query('ROLLBACK').catch(() => { });
    throw e;
  } finally {
    client.release();
  }
}

/**
 * @param {import('pg').Pool} pool
 * @param {{ userId: string, voucherId: string, amount: number|string, jobId?: string|null, promoEnabled?: boolean }} args
 */
export async function usePromoVoucher(pool, { userId, voucherId, amount: _clientAmountIgnored, jobId, promoEnabled = true }) {
  if (promoEnabled === false) {
    const err = new Error('promo_disabled');
    err.code = 'PROMO_DISABLED';
    throw err;
  }
  const uid = String(userId || '').trim();
  if (!isUuid(uid)) {
    const err = new Error('invalid_user_id');
    err.code = 'INVALID_USER_ID';
    throw err;
  }
  const vid = String(voucherId || '').trim();
  if (!vid) {
    const err = new Error('voucher_required');
    err.code = 'VOUCHER_REQUIRED';
    throw err;
  }
  const jobIdStr = jobId && String(jobId).trim() ? String(jobId).trim() : '';

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const vRes = await client.query(`SELECT * FROM user_promo_vouchers WHERE id = $1 FOR UPDATE`, [vid]);
    const v = vRes.rows?.[0];
    if (!v || String(v.user_id) !== uid) {
      await client.query('ROLLBACK');
      return { ok: false, error: 'not_found' };
    }

    const bnr = await client.query(`SELECT promo_claims_enabled FROM home_banners WHERE id = $1`, [v.banner_id]);
    if (bnr.rows?.[0]?.promo_claims_enabled === false) {
      await client.query('ROLLBACK');
      return { ok: false, error: 'promo_claims_paused' };
    }

    const now = new Date();
    if (v.expires_at && new Date(v.expires_at) < now) {
      await client.query('ROLLBACK');
      return { ok: false, error: 'expired' };
    }

    if (!jobIdStr) {
      await client.query('ROLLBACK');
      return { ok: false, error: 'job_required' };
    }

    const jRes = await client.query(
      `SELECT id, created_by, category,
              COALESCE(NULLIF(price, 0), NULLIF(budget_amount, 0), 0)::numeric AS job_price
       FROM jobs WHERE id::text = $1 LIMIT 1`,
      [jobIdStr]
    );
    const job = jRes.rows?.[0];
    if (!job) {
      await client.query('ROLLBACK');
      return { ok: false, error: 'job_not_found' };
    }
    const employerId = job.created_by ? String(job.created_by) : '';
    if (!employerId || employerId !== uid) {
      await client.query('ROLLBACK');
      return { ok: false, error: 'not_job_employer' };
    }

    if (v.first_paid_job_only === true) {
      const n = await countEmployerPaidJobsExcluding(client, uid, jobIdStr);
      if (n > 0) {
        await client.query('ROLLBACK');
        return { ok: false, error: 'not_first_paid_job' };
      }
    }

    const allowed = voucherAllowedCats(v);
    if (!categoryAllowed(allowed, job.category)) {
      await client.query('ROLLBACK');
      return { ok: false, error: 'category_not_allowed' };
    }

    const jobPrice = round2(Math.max(0, parseFloat(job.job_price) || 0));
    const useAmount = round2(computePromoDiscountThb(v, jobPrice));
    const rem = round2(parseFloat(v.remaining_baht) || 0);
    if (useAmount <= 0 || rem < useAmount) {
      await client.query('ROLLBACK');
      return { ok: false, error: 'nothing_to_use', remainingBaht: rem };
    }

    await debitDiscountPromoFundWithClient(client, {
      amountThb: useAmount,
      note: `โค้ด ${v.promo_code}`,
      adminId: 'system',
      kind: 'debit',
      ref: { voucher_id: vid, job_id: jobIdStr, user_id: uid, promo_code: v.promo_code },
    });

    let newRem = round2(rem - useAmount);
    if (v.first_paid_job_only === true) {
      newRem = 0;
    }

    await client.query(
      `UPDATE user_promo_vouchers SET remaining_baht = $2,
         metadata = COALESCE(metadata, '{}'::jsonb) || $3::jsonb
       WHERE id = $1`,
      [
        vid,
        newRem,
        JSON.stringify({
          last_use_at: new Date().toISOString(),
          last_job_id: jobIdStr,
          discount_mode: normMode(v),
          computed_discount_thb: useAmount,
        }),
      ]
    );

    const ledgerId = `L-PROMO-${vid}-${Date.now()}`;
    await client.query(
      `INSERT INTO payment_ledger_audit (id, event_type, payment_id, gateway, job_id, amount, currency, status, bill_no, transaction_no, user_id, metadata)
       VALUES ($1, 'promo_discount_subsidy', $2, 'wallet', $3, $4, 'THB', 'completed', $5, $6, $7, $8::jsonb)`,
      [
        ledgerId,
        vid,
        jobIdStr,
        useAmount,
        `PROMO-${vid}`,
        `T-PROMO-${Date.now()}`,
        uid,
        JSON.stringify({
          promo_code: v.promo_code,
          voucher_id: vid,
          kind: 'promo_discount_subsidy',
          discount_mode: normMode(v),
        }),
      ]
    );

    await client.query('COMMIT');
    return { ok: true, used: useAmount, remainingBaht: newRem, ledger_id: ledgerId };
  } catch (e) {
    await client.query('ROLLBACK').catch(() => { });
    if (e.code === 'INSUFFICIENT_PROMO_FUND') {
      return { ok: false, error: 'insufficient_promo_budget', balance_thb: e.balance_thb };
    }
    throw e;
  } finally {
    client.release();
  }
}

/**
 * @param {import('pg').Pool} pool
 */
export async function listUserPromoVouchers(pool, userId) {
  const uid = String(userId || '').trim();
  if (!isUuid(uid)) return [];
  const now = new Date().toISOString();
  const r = await pool.query(
    `SELECT v.*, COALESCE(b.promo_claims_enabled, TRUE) AS banner_promo_claims_enabled
     FROM user_promo_vouchers v
     LEFT JOIN home_banners b ON b.id = v.banner_id
     WHERE v.user_id = $1::uuid AND v.remaining_baht > 0
       AND (v.expires_at IS NULL OR v.expires_at > $2::timestamptz)
     ORDER BY v.claimed_at DESC`,
    [uid, now]
  );
  return (r.rows || []).map(rowToVoucher);
}
