/**
 * บันทึกบัตรเครดิต/เดบิตผ่าน PaySo (Omise-compatible token) ลง users.bank_accounts
 */

import { PaymentHttpClient } from './paymentHttpClient.js';
import { assertPaysoCardChargeReady } from './paysoCardToken.js';

function cardBrandLabel(brand) {
  const b = String(brand || '').toLowerCase();
  if (b.includes('visa')) return 'Visa';
  if (b.includes('master')) return 'Mastercard';
  if (b.includes('jcb')) return 'JCB';
  return brand ? String(brand) : 'Card';
}

export async function addPaysoCardFromToken(pool, userUuid, { cardToken, holderName }) {
  const token = String(cardToken || '').trim();
  if (!token) {
    const err = new Error('card token required');
    err.statusCode = 400;
    throw err;
  }

  const secretKey = assertPaysoCardChargeReady();
  const client = new PaymentHttpClient(secretKey);
  let tokenData;
  try {
    tokenData = await client.retrieveToken(token);
  } catch (e) {
    const err = new Error(e?.message || 'ไม่สามารถตรวจสอบ card token ได้');
    err.statusCode = 400;
    throw err;
  }

  const card = tokenData?.card || {};
  const last4 = String(card.last_digits || card.last4 || '').replace(/\D/g, '').slice(-4);
  const brand = cardBrandLabel(card.brand || card.financing);
  const expMonth = card.expiration_month || card.exp_month;
  const expYear = card.expiration_year || card.exp_year;
  const cardExpiry =
    expMonth && expYear
      ? `${String(expMonth).padStart(2, '0')}/${String(expYear).slice(-2)}`
      : null;

  const ur = await pool.query(
    `SELECT bank_accounts, full_name, email FROM users WHERE id = $1::uuid LIMIT 1`,
    [userUuid],
  );
  if (!ur.rows[0]) {
    const err = new Error('User not found');
    err.statusCode = 404;
    throw err;
  }

  const accounts = Array.isArray(ur.rows[0].bank_accounts)
    ? ur.rows[0].bank_accounts
    : [];

  const newAccount = {
    id: `card-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    type: 'card',
    provider_name: 'PaySo',
    account_number: last4 ? `****${last4}` : '****',
    account_name: String(holderName || ur.rows[0].full_name || 'Card holder').slice(0, 120),
    card_brand: brand,
    card_last4: last4 || undefined,
    card_expiry: cardExpiry || undefined,
    card_token: token,
    gateway: 'payso',
  };

  const updated = [...accounts, newAccount];
  await pool.query(
    `UPDATE users SET bank_accounts = $1::jsonb, updated_at = NOW() WHERE id = $2::uuid`,
    [JSON.stringify(updated), userUuid],
  );

  return { account: newAccount, bank_accounts: updated };
}

export async function patchLatestKycExpiryFields(pool, userUuid, { idCardExpiryDate, driverLicenseExpiry }) {
  const idExp = idCardExpiryDate || null;
  const dlExp = driverLicenseExpiry || null;
  if (!idExp && !dlExp) return { updated: false };

  const r = await pool.query(
    `UPDATE kyc_submissions SET
       id_card_expiry_date = COALESCE($1::date, id_card_expiry_date),
       driver_license_expiry = COALESCE($2::date, driver_license_expiry)
     WHERE id = (
       SELECT id FROM kyc_submissions WHERE user_id = $3::uuid
       ORDER BY submitted_at DESC NULLS LAST LIMIT 1
     )
     RETURNING id, id_card_expiry_date, driver_license_expiry`,
    [idExp, dlExp, userUuid],
  );
  return { updated: r.rows.length > 0, row: r.rows[0] || null };
}

export async function patchLatestKycPublicTransportDocs(
  pool,
  userUuid,
  {
    wantsPublicTransport,
    yellowPlatePhotoUrl,
    publicTransportLicenseFrontUrl,
    publicTransportLicenseBackUrl,
  },
  { validateUrl } = {},
) {
  const wants =
    wantsPublicTransport === true ||
    wantsPublicTransport === 'true' ||
    !!yellowPlatePhotoUrl ||
    !!publicTransportLicenseFrontUrl ||
    !!publicTransportLicenseBackUrl;

  const normUrl = (u) => {
    const s = u != null ? String(u).trim() : '';
    if (!s) return null;
    if (validateUrl && !validateUrl(s)) {
      const err = new Error(`ลิงก์รูปไม่ถูกต้อง: ${s.slice(0, 80)}`);
      err.statusCode = 400;
      throw err;
    }
    return s;
  };

  const yellow = normUrl(yellowPlatePhotoUrl);
  const front = normUrl(publicTransportLicenseFrontUrl);
  const back = normUrl(publicTransportLicenseBackUrl);

  if (wants && (!yellow || !front)) {
    const err = new Error('รถสาธารณะ: ต้องมีรูปป้ายเหลืองและใบขับขี่สาธารณะ (หน้า)');
    err.statusCode = 400;
    throw err;
  }

  const r = await pool.query(
    `UPDATE kyc_submissions SET
       wants_public_transport = COALESCE($1::boolean, wants_public_transport),
       yellow_plate_photo_url = COALESCE($2, yellow_plate_photo_url),
       public_transport_license_front_url = COALESCE($3, public_transport_license_front_url),
       public_transport_license_back_url = COALESCE($4, public_transport_license_back_url)
     WHERE id = (
       SELECT id FROM kyc_submissions WHERE user_id = $5::uuid
       ORDER BY submitted_at DESC NULLS LAST LIMIT 1
     )
     RETURNING id, wants_public_transport, yellow_plate_photo_url,
               public_transport_license_front_url, public_transport_license_back_url`,
    [wants ? true : wantsPublicTransport === false ? false : null, yellow, front, back, userUuid],
  );

  if (!r.rows[0]) {
    const err = new Error('ไม่พบ KYC submission — ส่ง KYC ก่อนหรือใช้ Wizard');
    err.statusCode = 404;
    throw err;
  }

  return { updated: true, row: r.rows[0] };
}
