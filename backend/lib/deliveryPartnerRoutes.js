/**
 * AQOND delivery partner signup — single source of truth for nexus-admin KYC review.
 * Storefront /m/rider/signup posts here (JWT); admin sees users + kyc_submissions like mobile.
 */

import { kycInsertParams, kycInsertSql, parseKycExtendedFields } from './kycSubmissionPersist.js';
import { notifyAdminKycSubmitted } from './adminLiveEvents.js';

function trim(v, max = 4000) {
  const s = v != null ? String(v).trim() : '';
  return s ? s.slice(0, max) : '';
}

export function registerDeliveryPartnerRoutes(app, pool, { authenticateToken }) {
  app.post('/api/partner/delivery/register', authenticateToken, async (req, res) => {
    try {
      const body = req.body || {};
      const displayName = trim(body.display_name, 120);
      const phone = trim(body.phone, 32);
      const plate = trim(body.plate, 32);
      const bankAccount = trim(body.bank_account, 120);
      const vehicle = trim(body.vehicle || 'motorcycle', 32);
      const source = trim(body.source || 'aqond_storefront', 64);
      const dispatchRiderId = body.dispatch_rider_id ? trim(body.dispatch_rider_id, 64) : null;

      if (!displayName || !phone || !plate || !bankAccount) {
        return res.status(400).json({
          error: 'missing_fields',
          message: 'กรุณากรอกชื่อ เบอร์โทร ทะเบียนรถ และบัญชีรับเงิน',
        });
      }

      const jwtUserId = String(req.user?.id || '').trim();
      if (!jwtUserId) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const userLookup = await pool.query(
        `SELECT id, firebase_uid, kyc_status, full_name, phone, role
         FROM users WHERE id::text = $1 LIMIT 1`,
        [jwtUserId],
      );
      if (!userLookup.rows?.length) {
        return res.status(404).json({ error: 'user_not_found' });
      }
      const user = userLookup.rows[0];
      const userId = user.id;

      const dup = await pool.query(
        `SELECT id FROM kyc_submissions
         WHERE user_id = $1::uuid
           AND status IN ('pending_review', 'pending', 'under_review')
           AND (
             address ILIKE '%AQOND แอปไรเดอร์%'
             OR vehicles_json::text ILIKE '%aqond_storefront%'
             OR vehicles_json::text ILIKE '%aqond_delivery%'
           )
         LIMIT 1`,
        [userId],
      );
      if (dup.rows?.length) {
        return res.status(409).json({
          error: 'already_registered',
          message: 'บัญชีนี้ส่งคำขอผู้ให้บริการแล้ว — รอแอดมินตรวจสอบ',
          submission_id: dup.rows[0].id,
        });
      }

      const vehiclesJson = JSON.stringify([
        {
          license_plate: plate,
          vehicle_type: vehicle,
          bank_account: bankAccount,
          channel: 'aqond_delivery',
          source,
          dispatch_rider_id: dispatchRiderId,
        },
      ]);

      const addressText = [
        'ช่องทาง: AQOND แอปไรเดอร์',
        `บัญชีรับเงิน: ${bankAccount}`,
        'สถานะ: รอตรวจสอบเอกสารยืนยันตัวตนเต็มรูปแบบ',
      ].join(' | ');

      const kycExtended = parseKycExtendedFields(body);
      const uploadedFiles = {
        idCardFront: null,
        idCardBack: null,
        selfiePhoto: null,
        drivingLicenseFront: null,
        drivingLicenseBack: null,
        selfieVideo: null,
      };

      const insert = await pool.query(
        kycInsertSql(),
        kycInsertParams(
          {
            resolvedUserUuid: userId,
            firebaseUid: user.firebase_uid || null,
            fullName: displayName,
            birthDateNorm: null,
            idCardNorm: null,
            addressNorm: addressText,
            vehiclesJsonParam: vehiclesJson,
          },
          kycExtended,
          uploadedFiles,
          {},
        ),
      );

      const submission = insert.rows[0];
      const kycAlreadyVerified = ['verified', 'approved', 'level_2', 'ai_verified'].includes(
        String(user.kyc_status || '').toLowerCase(),
      );

      await pool.query(
        `UPDATE users SET
          full_name = COALESCE(NULLIF(TRIM(full_name), ''), $2),
          phone = COALESCE(NULLIF(TRIM(phone), ''), $3),
          kyc_submitted_at = COALESCE(kyc_submitted_at, NOW()),
          kyc_status = CASE
            WHEN $4::boolean THEN kyc_status
            ELSE 'pending_review'
          END,
          updated_at = NOW()
         WHERE id = $1::uuid`,
        [userId, displayName, phone, kycAlreadyVerified],
      );

      try {
        await notifyAdminKycSubmitted(pool, {
          userId,
          submissionId: submission.id,
          isSupplement: false,
        });
      } catch {
        /* non-fatal */
      }

      const opsHook = (process.env.KYC_SUBMISSION_OPS_WEBHOOK_URL || '').trim();
      if (opsHook) {
        void fetch(opsHook, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            event: 'delivery_partner_registered',
            user_id: userId,
            submission_id: submission.id,
            channel: source,
            dispatch_rider_id: dispatchRiderId,
            submitted_at: new Date().toISOString(),
          }),
        }).catch(() => null);
      }

      return res.json({
        success: true,
        submission_id: submission.id,
        status: kycAlreadyVerified ? user.kyc_status : 'pending_review',
        message: 'ส่งข้อมูลแล้ว — แอดมินจะตรวจสอบใน Nexus Admin (KYC Review)',
        admin_path: '/kyc-review',
      });
    } catch (err) {
      console.error('POST /api/partner/delivery/register error:', err);
      return res.status(500).json({ error: err?.message || 'registration_failed' });
    }
  });
}
