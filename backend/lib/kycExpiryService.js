/**
 * ตรวจบัตรหมดอายุอัตโนมัติ → สั่ง resubmission_required + แจ้ง admin
 */

import { requestKycResubmit } from './kycSupplementService.js';
import { insertAdminLiveEvent } from './adminLiveEvents.js';

export async function ensureKycExpirySchema(pool) {
  await pool.query(`ALTER TABLE kyc_submissions ADD COLUMN IF NOT EXISTS id_card_expiry_date DATE`).catch(() => { });
  await pool.query(`ALTER TABLE kyc_submissions ADD COLUMN IF NOT EXISTS driver_license_expiry DATE`).catch(() => { });
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS kyc_resubmit_trigger VARCHAR(32)`).catch(() => { });
}

function isPastDate(val) {
  if (!val) return false;
  const d = new Date(val);
  if (Number.isNaN(d.getTime())) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  d.setHours(0, 0, 0, 0);
  return d < today;
}

export async function runKycExpiryCheck(pool) {
  const r = await pool.query(`
    SELECT u.id, u.full_name, u.phone, u.kyc_status,
           s.id_card_expiry_date, s.driver_license_expiry,
           s.id_card_number
    FROM users u
    INNER JOIN LATERAL (
      SELECT id_card_expiry_date, driver_license_expiry, id_card_number
      FROM kyc_submissions
      WHERE user_id = u.id
      ORDER BY submitted_at DESC NULLS LAST
      LIMIT 1
    ) s ON TRUE
    WHERE LOWER(TRIM(COALESCE(u.kyc_status, ''))) IN ('approved', 'verified')
  `);

  let triggered = 0;
  for (const row of r.rows || []) {
    const idExpired = isPastDate(row.id_card_expiry_date);
    const dlExpired = isPastDate(row.driver_license_expiry);
    if (!idExpired && !dlExpired) continue;

    const parts = [];
    if (idExpired) parts.push('บัตรประชาชนหมดอายุ');
    if (dlExpired) parts.push('ใบขับขี่หมดอายุ');
    const instruction = `[AUTO_EXPIRY] ${parts.join(' · ')} — กรุณาอัปโหลดเอกสารใหม่ในแอป (Settings → Thai ID & Documents หรือ KYC Wizard)`;

    await pool.query(
      `UPDATE users SET kyc_resubmit_trigger = 'id_expired', updated_at = NOW() WHERE id = $1::uuid`,
      [row.id],
    ).catch(() => { });

    await requestKycResubmit(pool, {
      userUuid: row.id,
      adminId: 'system_expiry_cron',
      instruction,
      deadline: null,
      requiredSteps: idExpired
        ? ['บัตรประชาชน (หน้า/หลัง)', 'รูปเซลฟี่']
        : ['ใบขับขี่'],
    });

    await insertAdminLiveEvent(pool, {
      event_type: 'kyc_expiry_resubmit',
      user_id: row.id,
      title: 'KYC — บัตรหมดอายุ (สั่งกรอกให้อัตโนมัติ)',
      message: `${row.full_name || row.phone || row.id}: ${parts.join(', ')}`,
      payload: { trigger: 'id_expired', id_expired: idExpired, dl_expired: dlExpired },
    }).catch(() => { });

    triggered += 1;
  }
  return { triggered };
}
