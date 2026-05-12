/**
 * กองทุนงบประมาณสำหรับโค้ดส่วนลด/แคมเปญ — เก็บใน system_settings (ไม่ใช่การโอนเงินจริงอัตโนมัติ แต่เป็นยอดที่แอดมันยืนยันจัดสรรจากรายได้ประมาณการ)
 */
export const DISCOUNT_PROMO_FUND_KEY = 'discount_promo_fund';

function round2(n) {
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}

function parseFundRaw(raw) {
  if (!raw) return { balance_thb: 0, movements: [] };
  try {
    const j = JSON.parse(String(raw));
    return {
      balance_thb: Math.max(0, Math.min(1e12, round2(j.balance_thb ?? 0))),
      movements: Array.isArray(j.movements) ? j.movements.slice(-50) : [],
    };
  } catch {
    return { balance_thb: 0, movements: [] };
  }
}

/**
 * @param {import('pg').Pool} pool
 */
export async function getDiscountPromoFund(pool) {
  const r = await pool.query(`SELECT value, updated_at FROM system_settings WHERE key = $1`, [
    DISCOUNT_PROMO_FUND_KEY,
  ]);
  const raw = r.rows?.[0]?.value;
  const parsed = parseFundRaw(raw);
  return {
    ...parsed,
    updated_at: r.rows?.[0]?.updated_at ? String(r.rows[0].updated_at) : null,
  };
}

/**
 * หักงบกองทุนใน transaction เดียวกับ voucher / ledger — ต้องใช้ client เดียวกัน
 * @param {import('pg').PoolClient} client
 */
export async function debitDiscountPromoFundWithClient(client, { amountThb, note, adminId, kind, ref }) {
  const amount = round2(amountThb);
  if (!(amount > 0)) {
    const err = new Error('invalid_amount');
    err.code = 'INVALID_AMOUNT';
    throw err;
  }
  const r = await client.query(
    `SELECT value FROM system_settings WHERE key = $1 FOR UPDATE`,
    [DISCOUNT_PROMO_FUND_KEY]
  );
  const raw = r.rows?.[0]?.value;
  const cur = parseFundRaw(raw);
  const newBalance = round2(cur.balance_thb - amount);
  if (newBalance < 0) {
    const err = new Error('insufficient_promo_fund');
    err.code = 'INSUFFICIENT_PROMO_FUND';
    err.balance_thb = cur.balance_thb;
    throw err;
  }
  const movement = {
    at: new Date().toISOString(),
    amount_thb: amount,
    note: String(note || '')
      .trim()
      .slice(0, 500),
    admin_id: adminId || null,
    kind: kind || 'debit',
    ref: ref && typeof ref === 'object' ? ref : {},
  };
  const movements = [...cur.movements, movement].slice(-50);
  const value = JSON.stringify({
    balance_thb: newBalance,
    movements,
  });
  await client.query(
    `INSERT INTO system_settings (key, value, updated_at) VALUES ($1, $2, NOW())
     ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = NOW()`,
    [DISCOUNT_PROMO_FUND_KEY, value]
  );
  return { balance_thb: newBalance, movement, movements };
}

/**
 * @param {import('pg').Pool} pool
 * @param {{ amountThb: number, note: string, adminId?: string }} args
 */
export async function creditDiscountPromoFund(pool, { amountThb, note, adminId }) {
  const amount = round2(amountThb);
  if (!(amount > 0)) {
    const err = new Error('invalid_amount');
    err.code = 'INVALID_AMOUNT';
    throw err;
  }
  const r0 = await pool.query(`SELECT value FROM system_settings WHERE key = $1`, [
    DISCOUNT_PROMO_FUND_KEY,
  ]);
  const cur = parseFundRaw(r0.rows?.[0]?.value);
  const newBalance = round2(cur.balance_thb + amount);
  const movement = {
    at: new Date().toISOString(),
    amount_thb: amount,
    note: String(note || '')
      .trim()
      .slice(0, 500),
    admin_id: adminId || null,
    kind: 'credit',
  };
  const movements = [...cur.movements, movement].slice(-50);
  const value = JSON.stringify({
    balance_thb: newBalance,
    movements,
  });
  await pool.query(
    `INSERT INTO system_settings (key, value, updated_at) VALUES ($1, $2, NOW())
     ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = NOW()`,
    [DISCOUNT_PROMO_FUND_KEY, value],
  );
  return { balance_thb: newBalance, movement, movements };
}
