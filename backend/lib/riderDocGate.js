/**
 * Rider document expiry gate — DB-only compliance check.
 *
 * Runs BEFORE the face gate on go-online: a rider whose ID card or driving
 * licence has expired is legally barred from operating regardless of identity,
 * so we block here first (cheaper than Rekognition, better UX than making them
 * selfie only to be rejected). Reuses kyc_submissions expiry columns from
 * migration 225 and the rider-KYC linkage from riderKycPortrait.js.
 */
import { riderKycWhereSql } from './riderKycPortrait.js';

/** Warning thresholds (days before expiry) surfaced to the rider. */
const WARN_DAYS = [30, 15, 7];

function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function daysUntil(val) {
  if (!val) return null;
  const d = new Date(val);
  if (Number.isNaN(d.getTime())) return null;
  d.setHours(0, 0, 0, 0);
  return Math.round((d.getTime() - startOfToday().getTime()) / 86_400_000);
}

/**
 * @returns {Promise<
 *  | { ok: true, warnings: Array<{ doc: string, days_left: number, expires_on: string }> }
 *  | { ok: false, code: 'doc_expired', docs: Array<{ doc: string, expires_on: string }>, message: string }
 * >}
 */
export async function checkRiderDocExpiry(pool, userId) {
  let row = null;
  try {
    const q = await pool.query(
      `SELECT id_card_expiry_date, driver_license_expiry
         FROM kyc_submissions
        WHERE user_id = $1::uuid AND ${riderKycWhereSql('')}
        ORDER BY submitted_at DESC NULLS LAST, created_at DESC
        LIMIT 1`,
      [userId],
    );
    row = q.rows?.[0] || null;
  } catch {
    // Fail-open on schema/query error: doc expiry is a compliance lock, not a
    // fraud gate — do not mass-block riders if the query breaks. The face gate
    // still runs after this.
    return { ok: true, warnings: [] };
  }

  if (!row) return { ok: true, warnings: [] };

  const fields = [
    { doc: 'id_card', label: 'บัตรประชาชน', value: row.id_card_expiry_date },
    { doc: 'driver_license', label: 'ใบขับขี่', value: row.driver_license_expiry },
  ];

  const expired = [];
  const warnings = [];
  for (const f of fields) {
    const left = daysUntil(f.value);
    if (left == null) continue;
    const expiresOn = new Date(f.value).toISOString().slice(0, 10);
    if (left < 0) {
      expired.push({ doc: f.doc, label: f.label, expires_on: expiresOn });
    } else if (left <= WARN_DAYS[0]) {
      warnings.push({ doc: f.doc, label: f.label, days_left: left, expires_on: expiresOn });
    }
  }

  if (expired.length) {
    const names = expired.map((e) => e.label).join(' · ');
    return {
      ok: false,
      code: 'doc_expired',
      docs: expired,
      message: `${names}หมดอายุ — อัปโหลดเอกสารใหม่ก่อนเปิดรับงาน`,
    };
  }

  return { ok: true, warnings };
}

export { WARN_DAYS as RIDER_DOC_WARN_DAYS };
