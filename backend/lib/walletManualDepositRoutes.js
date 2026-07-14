/**
 * Manual wallet deposits (QR static / slip queue) — user submit + admin list/approve.
 * Does not touch payment-gateway webhooks or /api/wallet/topup immediate credit.
 */
import crypto from 'crypto';
import fs from 'fs';
import { uploadToS3 } from './s3-client.js';
import { creditWalletDepositFromManualApproval } from './walletDepositHybrid.js';

/** ข้อความปฏิเสธมาตรฐาน (ภาษาไทย) — เก็บใน rejection_reason เป็น JSON พร้อม code */
export const MANUAL_DEPOSIT_REJECT_REASON_MESSAGES = Object.freeze({
  NO_INBOUND_MATCH:
    'จากการตรวจสอบกับรายการเงินเข้าบัญชีของบริษัท เราไม่พบธุรกรรมที่สอดคล้องกับจำนวนเงินและช่วงเวลาที่ท่านแจ้ง จึงไม่สามารถยืนยันและบันทึกการเติมเงินในระบบนี้ได้',
  NOT_ATTRIBUTABLE_TO_SERVICE:
    'เราไม่สามารถยืนยันได้ว่าธุรกรรมที่แจ้งนี้เชื่อมโยงกับบัญชีหรือบริการของ AQOND — การเติมเงินผ่านรายการนี้ถูกยกเลิก',
  SLIP_MISMATCH:
    'ข้อมูลในหลักฐานการโอนที่ท่านส่งไม่ตรงกับรายการเงินเข้าที่เราตรวจสอบได้จากทางธนาคาร/ระบบบัญชี',
  DOCUMENT_NOT_VERIFIABLE:
    'จากการพิจารณาตามเกณฑ์ภายใน เราไม่สามารถยืนยันความถูกต้องหรือถูกต้องตามจริงของเอกสารประกอบได้ และจึงไม่สามารถดำเนินการเติมเงินได้ (ประกอบด้วยกรณีที่เอกสารอาจถูกปลอมแปลง สร้างขึ้น หรือแก้ไขโดยมิชอบ)',
  POLICY_VIOLATION:
    'รายการนี้ไม่เป็นไปตามข้อกำหนดหรือนโยบายการให้บริการของเรา',
});

const OTHER_REASON_CODE = 'OTHER';

function sanitizeAdminRejectNote(note) {
  if (note === undefined || note === null) return '';
  let s = String(note).trim();
  s = s.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, '');
  if (s.length > 600) s = s.slice(0, 600);
  return s;
}

/**
 * Build JSON string for manual_deposits.rejection_reason
 * @returns {{ ok: true, json: string } | { ok: false, code: string }}
 */
export function composeManualRejectReasonRecord(reasonCode, noteRaw) {
  const normalized = String(reasonCode || '').trim().toUpperCase().replace(/-/g, '_');
  const note = sanitizeAdminRejectNote(noteRaw);
  if (normalized === OTHER_REASON_CODE) {
    if (note.length < 8) return { ok: false, code: 'REJECT_NOTE_REQUIRED' };
    const payload = {
      code: OTHER_REASON_CODE,
      message: `รายการถูกปฏิเสธโดยฝ่ายตรวจสอบ: ${note}`,
      internal_note: note,
    };
    return { ok: true, json: JSON.stringify(payload) };
  }
  const message = MANUAL_DEPOSIT_REJECT_REASON_MESSAGES[normalized];
  if (!message) return { ok: false, code: 'INVALID_REASON_CODE' };
  const payload = { code: normalized, message };
  if (note) payload.internal_note = note;
  return { ok: true, json: JSON.stringify(payload) };
}

function sha256Hex(buf) {
  return crypto.createHash('sha256').update(buf).digest('hex');
}

function toCsvCell(v) {
  if (v === null || v === undefined) return '';
  const s = String(v);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

/** User POST manual deposit — duplicates from migrations 163 / 164 (constraint = index name). */
export function mapManualDepositInsertUniqueViolation(err) {
  if (!err || err.code !== '23505') return null;
  const c = String(err.constraint || '').toLowerCase();
  if (
    c === 'idx_manual_deposits_user_slip_sha_active' ||
    c.includes('user_slip_sha_active') ||
    c.includes('slip_sha')
  ) {
    return {
      status: 409,
      code: 'MANUAL_DEPOSIT_DUPLICATE_SLIP',
      error: 'สลิปนี้ถูกส่งไปแล้วหรือใช้ไฟล์เดิมซ้ำไม่ได้',
    };
  }
  if (
    c === 'idx_manual_deposits_one_pending_per_user_amount' ||
    c.includes('one_pending_per_user_amount')
  ) {
    return {
      status: 409,
      code: 'MANUAL_DEPOSIT_DUPLICATE_AMOUNT_PENDING',
      error: 'มียอดเดียวกันรอตรวจอยู่แล้ว — รอให้ทีมอนุมัติหรือปฏิเสธก่อน',
    };
  }
  return { status: 409, code: 'MANUAL_DEPOSIT_CONFLICT', error: 'ไม่สามารถบันทึกคำขอได้ (ข้อมูลซ้ำ)' };
}

/** Admin approve — bank_ref uniqueness (migration 165). */
export function mapManualDepositBankRefUniqueViolation(err) {
  if (!err || err.code !== '23505') return null;
  const c = String(err.constraint || '').toLowerCase();
  if (c.includes('bank_ref_approved')) {
    return {
      status: 409,
      code: 'BANK_REF_DUPLICATE',
      error: 'เลขอ้างอิงนี้ถูกใช้ในรายการที่อนุมัติแล้ว',
    };
  }
  return null;
}

/**
 * @param {import('express').Express} app
 * @param {{
 *   pool: import('pg').Pool,
 *   paymentLimiter: import('express-rate-limit').RateLimitRequestHandler,
 *   uploadMulter: import('multer').Multer,
 *   resolveAdvanceJobUserId: (req: import('express').Request) => string | null,
 *   resolveUserIdToUuid: (userId: string) => Promise<string | null>,
 *   isWalletFrozen: (uuid: string) => Promise<boolean>,
 *   adminAuthMiddleware: import('express').RequestHandler,
 * }} deps
 */
export function attachWalletManualDepositRoutes(app, deps) {
  const {
    pool,
    paymentLimiter,
    uploadMulter,
    resolveAdvanceJobUserId,
    resolveUserIdToUuid,
    isWalletFrozen,
    adminAuthMiddleware,
  } = deps;

  app.post(
    '/api/wallet/deposit/manual',
    paymentLimiter,
    uploadMulter.single('file'),
    async (req, res) => {
      try {
        const userId = resolveAdvanceJobUserId(req);
        if (!userId) return res.status(401).json({ error: 'กรุณาเข้าสู่ระบบ' });
        const userUuid = await resolveUserIdToUuid(userId);
        if (!userUuid) return res.status(403).json({ error: 'ไม่พบตัวตนผู้ใช้ในระบบ' });
        const frozen = await isWalletFrozen(userUuid);
        if (frozen)
          return res.status(403).json({ error: 'วอลเล็ตถูกระงับ — ไม่สามารถเติมเงินได้ กรุณาติดต่อฝ่ายสนับสนุน' });

        if (!req.file || !req.file.buffer) {
          return res.status(400).json({ error: 'ไม่มีไฟล์สลิป — อัปโหลดรูปหรือ PDF' });
        }
        const amountNum = Math.round(Number(req.body?.amount ?? req.body?.Amount) * 100) / 100;
        if (!(amountNum >= 1)) return res.status(400).json({ error: 'กรุณาระบุจำนวนเงิน (ขั้นต่ำ 1 บาท)' });

        const slipSha = sha256Hex(req.file.buffer);
        const mime = req.file.mimetype || 'application/octet-stream';
        const ext =
          /\.(jpg|jpeg|png|gif|webp|pdf)$/i.test(req.file.originalname || '')
            ? (req.file.originalname.match(/\.[a-z0-9]+$/i) || [''])[0]
            : mime.includes('pdf')
              ? '.pdf'
              : '.jpg';

        const key = `wallet_manual_deposits/${userUuid}/${Date.now()}_${crypto.randomBytes(6).toString('hex')}${ext}`;
        const upload = await uploadToS3(req.file.buffer, {
          folder: 'wallet_manual_deposits',
          key,
          contentType: mime,
          resourceType: 'auto',
        });
        const slipUrl = upload.secure_url || upload.url;
        if (!slipUrl) return res.status(500).json({ error: 'อัปโหลดสลิปล้มเหลว' });

        try {
          const ins = await pool.query(
            `INSERT INTO manual_deposits (user_id, amount, slip_url, slip_sha256, status)
             VALUES ($1::uuid, $2::numeric, $3, $4, 'manual_pending_verification')
             RETURNING id, status, amount, created_at`,
            [userUuid, amountNum, slipUrl, slipSha]
          );
          const row = ins.rows[0];
          await pool.query(
            `INSERT INTO financial_audit_log (actor_type, actor_id, action, entity_type, entity_id, reason, correlation_id, state_after)
             VALUES ('user', $1, 'MANUAL_DEPOSIT_SUBMITTED', 'manual_deposit', $2, 'manual_slip_submitted', $2, $3::jsonb)`,
            [
              String(userUuid),
              String(row.id),
              JSON.stringify({
                amount: Number(row.amount || amountNum),
                status: row.status || 'manual_pending_verification',
              }),
            ]
          ).catch(() => { });
          return res.status(201).json({
            id: row.id,
            status: row.status,
            amount: Number(row.amount),
            created_at: row.created_at ? new Date(row.created_at).toISOString() : undefined,
          });
        } catch (e) {
          const mapped = mapManualDepositInsertUniqueViolation(e);
          if (mapped) return res.status(mapped.status).json({ error: mapped.error, code: mapped.code });
          if (e.code === '42P01') {
            return res.status(503).json({ error: 'ตาราง manual_deposits ยังไม่พร้อม — รัน migration' });
          }
          throw e;
        }
      } catch (err) {
        console.error('POST /api/wallet/deposit/manual error:', err?.message || err);
        return res.status(500).json({ error: err?.message || 'บันทึกคำขอเติมเงินไม่สำเร็จ' });
      }
    }
  );

  app.get('/api/admin/manual-deposits', adminAuthMiddleware, async (req, res) => {
    try {
      const status = (req.query.status || '').toString().trim().toLowerCase();
      let where = '';
      const params = [];
      const st =
        ['manual_pending_verification', 'approved', 'rejected'].includes(status) ? status : null;
      if (st && st !== 'all') {
        params.push(st);
        where = `WHERE d.status = $${params.length}`;
      }
      const q = `
        SELECT d.id, d.user_id, d.amount, d.slip_url, d.slip_sha256,
               NULLIF(trim(COALESCE(d.bank_ref_id, '')::text), '') AS bank_ref_id,
               d.status, d.rejection_reason,
               d.created_at::timestamptz AS created_at, d.reviewed_at::timestamptz AS reviewed_at,
               NULLIF(trim(COALESCE(d.reviewed_by, '')::text), '') AS reviewed_by,
               u.email AS user_email
        FROM manual_deposits d
        LEFT JOIN users u ON u.id = d.user_id
        ${where}
        ORDER BY d.created_at DESC
        LIMIT 200
      `;
      const result = await pool.query(q, params.length ? params : undefined);
      const rows = (result.rows || []).map((r) => ({
        id: String(r.id),
        user_id: String(r.user_id),
        amount: r.amount !== undefined && r.amount !== null ? Number(r.amount) : r.amount,
        slip_url: r.slip_url,
        slip_sha256: r.slip_sha256 || null,
        bank_ref_id: r.bank_ref_id || null,
        status: r.status,
        rejection_reason: r.rejection_reason || null,
        created_at: r.created_at ? new Date(r.created_at).toISOString() : undefined,
        reviewed_at: r.reviewed_at ? new Date(r.reviewed_at).toISOString() : null,
        reviewed_by: r.reviewed_by || null,
        user_email: r.user_email || null,
      }));
      return res.json({ rows });
    } catch (err) {
      console.error('GET /api/admin/manual-deposits error:', err?.message || err);
      if (String(err?.code) === '42703') {
        return res.status(503).json({
          error:
            'ฐานข้อมูลของสภาพแวดล้อมนี้ยังไม่ตรงกับโค้ด — โดยปกติต้องรัน migration เช่น 163 (slip_sha256), 164, 165 และให้แน่ใจว่ามีตาราง manual_deposits จาก migration 158 แล้ว',
          code: 'MANUAL_DEPOSITS_SCHEMA_MISMATCH',
          hint:
            String(err.message || '').includes('slip_sha256')
              ? 'รัน migration 163 บน Postgres ที่ backend ผูกอยู่ แล้วรีโหลดแอดมิน'
              : 'PostgreSQL undefined_column — เปรียบเทียบ schema ตาราง manual_deposits กับ backend/db/migrations',
        });
      }
      return res.status(500).json({ error: err?.message || 'โหลดรายการล้มเหลว' });
    }
  });

  app.get('/api/admin/wallet-deposit-charges', adminAuthMiddleware, async (req, res) => {
    try {
      const sourceTypeRaw = String(req.query.source_type || req.query.sourceType || '').trim().toLowerCase();
      const statusRaw = String(req.query.status || '').trim().toLowerCase();
      const userIdRaw = String(req.query.user_id || req.query.userId || '').trim();
      const limitRaw = Number(req.query.limit || 200);
      const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(Math.floor(limitRaw), 1), 500) : 200;
      const where = [];
      const params = [];
      if (sourceTypeRaw && sourceTypeRaw !== 'all') {
        params.push(sourceTypeRaw);
        where.push(`COALESCE(c.source_type, 'promptpay') = $${params.length}`);
      }
      if (statusRaw && statusRaw !== 'all') {
        params.push(statusRaw);
        where.push(`LOWER(COALESCE(c.status, '')) = $${params.length}`);
      }
      if (userIdRaw) {
        params.push(userIdRaw);
        where.push(`c.user_id = $${params.length}::uuid`);
      }
      params.push(limit);
      const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
      const q = `
        SELECT
          c.charge_id,
          c.user_id,
          c.amount,
          c.currency,
          c.status,
          COALESCE(c.source_type, 'promptpay') AS source_type,
          c.slip_url,
          c.ledger_id,
          c.created_at::timestamptz AS created_at,
          c.completed_at::timestamptz AS completed_at,
          u.email AS user_email
        FROM wallet_deposit_charges c
        LEFT JOIN users u ON u.id = c.user_id
        ${whereSql}
        ORDER BY c.created_at DESC
        LIMIT $${params.length}
      `;
      const result = await pool.query(q, params);
      const rows = (result.rows || []).map((r) => ({
        charge_id: String(r.charge_id),
        user_id: String(r.user_id),
        amount: r.amount !== undefined && r.amount !== null ? Number(r.amount) : r.amount,
        currency: r.currency || 'THB',
        status: r.status || 'pending',
        source_type: r.source_type || 'promptpay',
        slip_url: r.slip_url || null,
        ledger_id: r.ledger_id || null,
        created_at: r.created_at ? new Date(r.created_at).toISOString() : null,
        completed_at: r.completed_at ? new Date(r.completed_at).toISOString() : null,
        user_email: r.user_email || null,
      }));
      // #region agent log
      fetch("http://127.0.0.1:7638/ingest/0fd4d8e7-61a2-4558-83aa-540c669e45fd", { method: "POST", headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "1d8d58" }, body: JSON.stringify({ sessionId: "1d8d58", runId: "m1-smoke", hypothesisId: "H9", location: "backend/lib/walletManualDepositRoutes.js:/api/admin/wallet-deposit-charges", message: "admin wallet deposit charge list queried", data: { source_type: sourceTypeRaw || "all", status: statusRaw || "all", row_count: rows.length }, timestamp: Date.now() }) }).catch(() => { });
      // #endregion
      return res.json({ rows });
    } catch (err) {
      console.error('GET /api/admin/wallet-deposit-charges error:', err?.message || err);
      return res.status(500).json({ error: err?.message || 'โหลดรายการเติมเงินจากเกตเวย์ล้มเหลว' });
    }
  });

  app.get('/api/admin/wallet-deposit-charges/:chargeId/detail', adminAuthMiddleware, async (req, res) => {
    try {
      const chargeId = String(req.params.chargeId || '').trim();
      if (!chargeId) return res.status(400).json({ error: 'missing_charge_id' });
      const chargeRes = await pool.query(
        `SELECT
           c.charge_id,
           c.user_id,
           c.amount,
           c.currency,
           c.status,
           COALESCE(c.source_type, 'promptpay') AS source_type,
           c.ledger_id,
           c.created_at::timestamptz AS created_at,
           c.completed_at::timestamptz AS completed_at,
           u.email AS user_email
         FROM wallet_deposit_charges c
         LEFT JOIN users u ON u.id = c.user_id
         WHERE c.charge_id = $1
         LIMIT 1`,
        [chargeId]
      );
      const charge = chargeRes.rows?.[0];
      if (!charge) return res.status(404).json({ error: 'charge_not_found' });

      const ledgerRes = await pool.query(
        `SELECT id, event_type, gateway, amount, net_amount, gateway_fee_amount, platform_margin_amount, status, bill_no, transaction_no, created_at
         FROM payment_ledger_audit
         WHERE id = $1 OR (event_type = 'wallet_deposit' AND payment_id = $2)
         ORDER BY created_at DESC
         LIMIT 1`,
        [charge.ledger_id || '', chargeId]
      ).catch(() => ({ rows: [] }));
      const ledger = ledgerRes.rows?.[0] || null;

      const webhookRows = await pool.query(
        `SELECT id, provider, event_status, http_status, signature_valid, bypass_unsigned, amount, transaction_id, payload_json, processing_result, created_at
         FROM wallet_deposit_webhook_logs
         WHERE charge_id = $1
         ORDER BY created_at ASC
         LIMIT 500`,
        [chargeId]
      ).then((r) => r.rows || []).catch(() => []);

      const auditRows = await pool.query(
        `SELECT id, actor_type, actor_id, action, entity_type, entity_id, reason, state_after, correlation_id, created_at
         FROM financial_audit_log
         WHERE (entity_type = 'wallet_deposit_charge' AND entity_id = $1) OR correlation_id = $1
         ORDER BY created_at ASC
         LIMIT 500`,
        [chargeId]
      ).then((r) => r.rows || []).catch(() => []);

      const timeline = [];
      timeline.push({
        at: charge.created_at ? new Date(charge.created_at).toISOString() : null,
        source: 'charge',
        title: 'Deposit charge created',
        payload: {
          charge_id: charge.charge_id,
          source_type: charge.source_type,
          amount: Number(charge.amount || 0),
          status: charge.status,
        },
      });
      for (const w of webhookRows) {
        timeline.push({
          at: w.created_at ? new Date(w.created_at).toISOString() : null,
          source: 'webhook',
          title: `Webhook ${String(w.provider || 'payso').toUpperCase()}`,
          payload: {
            event_status: w.event_status || null,
            http_status: w.http_status ?? null,
            signature_valid: w.signature_valid,
            bypass_unsigned: w.bypass_unsigned === true,
            transaction_id: w.transaction_id || null,
            amount: w.amount != null ? Number(w.amount) : null,
            processing_result: w.processing_result || null,
          },
        });
      }
      for (const a of auditRows) {
        timeline.push({
          at: a.created_at ? new Date(a.created_at).toISOString() : null,
          source: 'audit',
          title: String(a.action || 'AUDIT_EVENT'),
          payload: {
            actor_type: a.actor_type || null,
            actor_id: a.actor_id || null,
            reason: a.reason || null,
            state_after: a.state_after || null,
          },
        });
      }
      if (charge.completed_at) {
        timeline.push({
          at: new Date(charge.completed_at).toISOString(),
          source: 'charge',
          title: 'Deposit charge completed',
          payload: {
            status: charge.status,
            ledger_id: charge.ledger_id || null,
          },
        });
      }
      timeline.sort((a, b) => new Date(a.at || 0).getTime() - new Date(b.at || 0).getTime());

      return res.json({
        charge: {
          charge_id: String(charge.charge_id),
          user_id: String(charge.user_id),
          user_email: charge.user_email || null,
          amount: Number(charge.amount || 0),
          currency: charge.currency || 'THB',
          status: charge.status || 'pending',
          source_type: charge.source_type || 'promptpay',
          ledger_id: charge.ledger_id || null,
          created_at: charge.created_at ? new Date(charge.created_at).toISOString() : null,
          completed_at: charge.completed_at ? new Date(charge.completed_at).toISOString() : null,
        },
        ledger: ledger
          ? {
            id: String(ledger.id),
            event_type: ledger.event_type,
            gateway: ledger.gateway,
            amount: Number(ledger.amount || 0),
            net_amount: ledger.net_amount != null ? Number(ledger.net_amount) : null,
            gateway_fee_amount: ledger.gateway_fee_amount != null ? Number(ledger.gateway_fee_amount) : null,
            platform_margin_amount: ledger.platform_margin_amount != null ? Number(ledger.platform_margin_amount) : null,
            status: ledger.status || null,
            bill_no: ledger.bill_no || null,
            transaction_no: ledger.transaction_no || null,
            created_at: ledger.created_at ? new Date(ledger.created_at).toISOString() : null,
          }
          : null,
        webhook_logs: webhookRows.map((w) => ({
          id: String(w.id),
          provider: w.provider || 'payso',
          event_status: w.event_status || null,
          http_status: w.http_status ?? null,
          signature_valid: w.signature_valid,
          bypass_unsigned: w.bypass_unsigned === true,
          amount: w.amount != null ? Number(w.amount) : null,
          transaction_id: w.transaction_id || null,
          payload_json: w.payload_json || {},
          processing_result: w.processing_result || {},
          created_at: w.created_at ? new Date(w.created_at).toISOString() : null,
        })),
        audit_trail: auditRows.map((a) => ({
          id: Number(a.id),
          actor_type: a.actor_type || null,
          actor_id: a.actor_id || null,
          action: a.action || null,
          reason: a.reason || null,
          state_after: a.state_after || null,
          created_at: a.created_at ? new Date(a.created_at).toISOString() : null,
        })),
        timeline,
      });
    } catch (err) {
      console.error('GET /api/admin/wallet-deposit-charges/:chargeId/detail error:', err?.message || err);
      return res.status(500).json({ error: err?.message || 'โหลดรายละเอียด charge ไม่สำเร็จ' });
    }
  });

  app.get('/api/admin/wallet-deposit-charges/export.csv', adminAuthMiddleware, async (req, res) => {
    try {
      const sourceTypeRaw = String(req.query.source_type || req.query.sourceType || '').trim().toLowerCase();
      const statusRaw = String(req.query.status || '').trim().toLowerCase();
      const fromRaw = String(req.query.from || '').trim();
      const toRaw = String(req.query.to || '').trim();
      const where = [];
      const params = [];
      if (sourceTypeRaw && sourceTypeRaw !== 'all') {
        params.push(sourceTypeRaw);
        where.push(`COALESCE(c.source_type, 'promptpay') = $${params.length}`);
      }
      if (statusRaw && statusRaw !== 'all') {
        params.push(statusRaw);
        where.push(`LOWER(COALESCE(c.status, '')) = $${params.length}`);
      }
      if (fromRaw) {
        params.push(fromRaw);
        where.push(`c.created_at >= $${params.length}::date`);
      }
      if (toRaw) {
        params.push(toRaw);
        where.push(`c.created_at < ($${params.length}::date + INTERVAL '1 day')`);
      }
      const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
      const rows = await pool.query(
        `SELECT
           c.charge_id,
           c.user_id,
           u.email AS user_email,
           c.amount,
           c.currency,
           c.status,
           COALESCE(c.source_type, 'promptpay') AS source_type,
           c.ledger_id,
           c.created_at::timestamptz AS created_at,
           c.completed_at::timestamptz AS completed_at,
           l.net_amount,
           l.gateway_fee_amount,
           l.platform_margin_amount,
           wl.webhook_count,
           wl.last_webhook_at
         FROM wallet_deposit_charges c
         LEFT JOIN users u ON u.id = c.user_id
         LEFT JOIN payment_ledger_audit l ON l.id = c.ledger_id
         LEFT JOIN (
           SELECT charge_id, COUNT(*)::int AS webhook_count, MAX(created_at) AS last_webhook_at
           FROM wallet_deposit_webhook_logs
           GROUP BY charge_id
         ) wl ON wl.charge_id = c.charge_id
         ${whereSql}
         ORDER BY c.created_at DESC
         LIMIT 5000`,
        params
      );
      const header = [
        'charge_id',
        'created_at',
        'completed_at',
        'user_id',
        'user_email',
        'source_type',
        'status',
        'amount',
        'currency',
        'net_amount',
        'gateway_fee_amount',
        'platform_margin_amount',
        'ledger_id',
        'webhook_count',
        'last_webhook_at',
      ].join(',') + '\n';
      const body = (rows.rows || [])
        .map((r) => [
          toCsvCell(r.charge_id),
          toCsvCell(r.created_at ? new Date(r.created_at).toISOString() : ''),
          toCsvCell(r.completed_at ? new Date(r.completed_at).toISOString() : ''),
          toCsvCell(r.user_id),
          toCsvCell(r.user_email || ''),
          toCsvCell(r.source_type || 'promptpay'),
          toCsvCell(r.status || 'pending'),
          toCsvCell(r.amount),
          toCsvCell(r.currency || 'THB'),
          toCsvCell(r.net_amount),
          toCsvCell(r.gateway_fee_amount),
          toCsvCell(r.platform_margin_amount),
          toCsvCell(r.ledger_id || ''),
          toCsvCell(r.webhook_count ?? 0),
          toCsvCell(r.last_webhook_at ? new Date(r.last_webhook_at).toISOString() : ''),
        ].join(','))
        .join('\n');
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename=Wallet_Deposit_Charges_${new Date().toISOString().slice(0, 10)}.csv`);
      return res.send('\uFEFF' + header + body);
    } catch (err) {
      console.error('GET /api/admin/wallet-deposit-charges/export.csv error:', err?.message || err);
      return res.status(500).json({ error: err?.message || 'ส่งออก CSV ไม่สำเร็จ' });
    }
  });

  app.get('/api/admin/manual-deposits/export.csv', adminAuthMiddleware, async (req, res) => {
    try {
      const statusRaw = String(req.query.status || '').trim().toLowerCase();
      const where = [];
      const params = [];
      if (statusRaw && statusRaw !== 'all') {
        params.push(statusRaw);
        where.push(`d.status = $${params.length}`);
      }
      const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
      const rows = await pool.query(
        `SELECT
           d.id,
           d.user_id,
           u.email AS user_email,
           d.amount,
           d.status,
           d.bank_ref_id,
           d.rejection_reason,
           d.ledger_id,
           d.created_at::timestamptz AS created_at,
           d.reviewed_at::timestamptz AS reviewed_at,
           d.reviewed_by
         FROM manual_deposits d
         LEFT JOIN users u ON u.id = d.user_id
         ${whereSql}
         ORDER BY d.created_at DESC
         LIMIT 5000`,
        params
      );
      const header = [
        'manual_deposit_id',
        'created_at',
        'reviewed_at',
        'user_id',
        'user_email',
        'amount',
        'status',
        'bank_ref_id',
        'ledger_id',
        'reviewed_by',
        'rejection_reason',
      ].join(',') + '\n';
      const body = (rows.rows || [])
        .map((r) => [
          toCsvCell(r.id),
          toCsvCell(r.created_at ? new Date(r.created_at).toISOString() : ''),
          toCsvCell(r.reviewed_at ? new Date(r.reviewed_at).toISOString() : ''),
          toCsvCell(r.user_id),
          toCsvCell(r.user_email || ''),
          toCsvCell(r.amount),
          toCsvCell(r.status),
          toCsvCell(r.bank_ref_id || ''),
          toCsvCell(r.ledger_id || ''),
          toCsvCell(r.reviewed_by || ''),
          toCsvCell(r.rejection_reason || ''),
        ].join(','))
        .join('\n');
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename=Manual_Deposits_${new Date().toISOString().slice(0, 10)}.csv`);
      return res.send('\uFEFF' + header + body);
    } catch (err) {
      console.error('GET /api/admin/manual-deposits/export.csv error:', err?.message || err);
      return res.status(500).json({ error: err?.message || 'ส่งออก CSV ไม่สำเร็จ' });
    }
  });

  app.post('/api/admin/manual-deposits/:id/approve', adminAuthMiddleware, async (req, res) => {
    try {
      const bankRefRaw = req.body?.bank_ref_id ?? req.body?.bankRefId;
      const bankRefId = typeof bankRefRaw === 'string' ? bankRefRaw.trim() : '';
      if (!bankRefId)
        return res.status(400).json({ error: 'ต้องระบุเลขอ้างอิงธนาคาร/สลิป (bank_ref_id)', code: 'BANK_REF_REQUIRED' });

      const manualDepositId = String(req.params.id || '').trim();
      if (!manualDepositId || !/^[0-9a-fA-F-]{36}$/.test(manualDepositId)) {
        return res.status(400).json({ error: 'ไม่ได้รับรหัสรายการ' });
      }

      const sel = await pool.query(
        `SELECT id, user_id, amount::numeric AS amount_gross, status
         FROM manual_deposits WHERE id = $1::uuid`,
        [manualDepositId]
      );
      const row = sel.rows?.[0];
      if (!row) return res.status(404).json({ error: 'ไม่พบรายการ' });
      if (String(row.status) !== 'manual_pending_verification') {
        return res.status(400).json({ error: 'รายการนี้อยู่ในสถานะที่ไม่สามารถอนุมัติได้', code: 'MANUAL_DEPOSIT_NOT_PENDING' });
      }

      const userId = String(row.user_id);
      const grossAmount = Number(row.amount_gross);

      const reviewedBy = req.adminUser?.email || req.adminUser?.id || 'admin';

      try {
        await creditWalletDepositFromManualApproval(pool, {
          userId,
          manualDepositId,
          grossAmount,
          reviewedBy,
          bankRefId,
        });
        await pool.query(
          `INSERT INTO financial_audit_log (actor_type, actor_id, action, entity_type, entity_id, reason, correlation_id, state_after)
           VALUES ('admin', $1, 'MANUAL_DEPOSIT_APPROVED', 'manual_deposit', $2, 'wallet_credit_applied', $2, $3::jsonb)`,
          [
            String(reviewedBy || req.adminUser?.id || 'admin'),
            String(manualDepositId),
            JSON.stringify({
              amount: Number(grossAmount || 0),
              bank_ref_id: bankRefId,
              status: 'approved',
            }),
          ]
        ).catch(() => { });
        return res.json({ ok: true });
      } catch (e) {
        if (e?.code === 'MANUAL_DEPOSIT_INVALID') {
          return res.status(409).json({
            error: 'รายการนี้ไม่พร้อมให้อนุมัติ (อาจถูกดำเนินการแล้วหรือสถานะไม่ถูกต้อง)',
            code: 'MANUAL_DEPOSIT_INVALID',
          });
        }
        const bankDup = mapManualDepositBankRefUniqueViolation(e);
        if (bankDup) return res.status(bankDup.status).json({ error: bankDup.error, code: bankDup.code });
        if (e?.code === '23505') {
          return res.status(409).json({
            error: 'ไม่สามารถอนุมัติได้ (ข้อมูลซ้ำหรือความขัดแย้ง)',
            code: 'MANUAL_APPROVE_CONFLICT',
          });
        }
        console.error('POST /api/admin/manual-deposits/:id/approve error:', e?.message || e);
        return res.status(500).json({ error: String(e?.message || 'อนุมัติล้มเหลว') });
      }
    } catch (err) {
      console.error('POST /api/admin/manual-deposits/:id/approve outer error:', err?.message || err);
      return res.status(500).json({ error: err?.message || 'อนุมัติล้มเหลว' });
    }
  });

  app.post('/api/admin/manual-deposits/:id/reject', adminAuthMiddleware, async (req, res) => {
    try {
      const manualDepositId = String(req.params.id || '').trim();
      if (!manualDepositId || !/^[0-9a-fA-F-]{36}$/.test(manualDepositId)) {
        return res.status(400).json({ error: 'ไม่ได้รับรหัสรายการ' });
      }
      const reasonCodeRaw =
        req.body?.reason_code ?? req.body?.reasonCode ?? req.body?.code ?? '';
      const composed = composeManualRejectReasonRecord(reasonCodeRaw, req.body?.note ?? req.body?.internal_note);
      if (!composed.ok) {
        if (composed.code === 'INVALID_REASON_CODE')
          return res.status(400).json({
            error: 'เหตุผลที่เลือกไม่ถูกต้อง',
            code: 'INVALID_REASON_CODE',
          });
        return res.status(400).json({
          error: 'กรุณาระบุรายละเอียดเพิ่มเติมอย่างน้อย 8 ตัวอักษร (เหตุผลประเภทอื่น ๆ)',
          code: 'REJECT_NOTE_REQUIRED',
        });
      }

      const sel = await pool.query(
        `SELECT id, status FROM manual_deposits WHERE id = $1::uuid`,
        [manualDepositId]
      );
      const row = sel.rows?.[0];
      if (!row) return res.status(404).json({ error: 'ไม่พบรายการ' });
      if (String(row.status) !== 'manual_pending_verification') {
        return res.status(400).json({
          error: 'รายการนี้อยู่ในสถานะที่ไม่สามารถปฏิเสธได้',
          code: 'MANUAL_DEPOSIT_NOT_PENDING',
        });
      }

      const reviewedBy = req.adminUser?.email || req.adminUser?.id || 'admin';
      const upd = await pool.query(
        `UPDATE manual_deposits
         SET status = 'rejected',
             rejection_reason = $2::text,
             reviewed_at = NOW(),
             reviewed_by = $3::text
         WHERE id = $1::uuid AND status = 'manual_pending_verification'
         RETURNING id`,
        [manualDepositId, composed.json, reviewedBy]
      );
      if (!upd.rows?.length) {
        return res.status(409).json({
          error: 'รายการถูกดำเนินการไปแล้ว — รีเฟรชหน้ารายการ',
          code: 'MANUAL_DEPOSIT_REJECT_RACE',
        });
      }
      await pool.query(
        `INSERT INTO financial_audit_log (actor_type, actor_id, action, entity_type, entity_id, reason, correlation_id, state_after)
         VALUES ('admin', $1, 'MANUAL_DEPOSIT_REJECTED', 'manual_deposit', $2, 'manual_rejected', $2, $3::jsonb)`,
        [
          String(reviewedBy || req.adminUser?.id || 'admin'),
          String(manualDepositId),
          JSON.stringify({
            status: 'rejected',
            rejection_reason: composed.json,
          }),
        ]
      ).catch(() => { });

      return res.json({ ok: true });
    } catch (err) {
      console.error('POST /api/admin/manual-deposits/:id/reject error:', err?.message || err);
      return res.status(500).json({ error: err?.message || 'ปฏิเสธรายการล้มเหลว' });
    }
  });

  app.post('/api/admin/wallet-deposit-charges/export-async', adminAuthMiddleware, async (req, res) => {
    try {
      const { createAdminAsyncExportJob } = await import('./adminAsyncExportJobs.js');
      const params = {
        source_type: String(req.body?.source_type || req.query?.source_type || 'all').trim(),
        status: String(req.body?.status || req.query?.status || 'all').trim(),
        user_id: String(req.body?.user_id || req.query?.user_id || '').trim() || undefined,
      };
      const job = await createAdminAsyncExportJob(pool, {
        jobType: 'wallet_deposit_charges_csv',
        params,
        createdBy: String(req.adminUser?.id || req.adminUser?.email || 'admin'),
      });
      return res.status(202).json({ job_id: job.id, status: 'queued', poll_url: `/api/admin/export-jobs/${job.id}` });
    } catch (err) {
      console.error('POST /api/admin/wallet-deposit-charges/export-async error:', err?.message || err);
      return res.status(500).json({ error: err?.message || 'สร้างงาน export ล้มเหลว' });
    }
  });

  app.get('/api/admin/export-jobs/:id', adminAuthMiddleware, async (req, res) => {
    try {
      const id = String(req.params.id || '').trim();
      const r = await pool.query(
        `SELECT id, job_type, status, row_count, error, result_filename, created_at, completed_at
         FROM admin_async_export_jobs WHERE id = $1::uuid LIMIT 1`,
        [id],
      );
      if (!r.rows?.length) return res.status(404).json({ error: 'export_job_not_found' });
      const row = r.rows[0];
      const out = {
        id: row.id,
        job_type: row.job_type,
        status: row.status,
        row_count: row.row_count,
        error: row.error,
        created_at: row.created_at,
        completed_at: row.completed_at,
        download_url:
          row.status === 'done' && row.result_filename
            ? `/api/admin/export-jobs/${row.id}/download`
            : null,
      };
      return res.json(out);
    } catch (err) {
      return res.status(500).json({ error: err?.message || 'โหลดสถานะ export ล้มเหลว' });
    }
  });

  app.get('/api/admin/export-jobs/:id/download', adminAuthMiddleware, async (req, res) => {
    try {
      const id = String(req.params.id || '').trim();
      const r = await pool.query(
        `SELECT result_filename, status FROM admin_async_export_jobs WHERE id = $1::uuid LIMIT 1`,
        [id],
      );
      if (!r.rows?.length || r.rows[0].status !== 'done' || !r.rows[0].result_filename) {
        return res.status(404).json({ error: 'export_not_ready' });
      }
      const { getAdminExportFilePath } = await import('./adminAsyncExportJobs.js');
      const fp = getAdminExportFilePath(r.rows[0].result_filename);
      if (!fp || !fs.existsSync(fp)) {
        return res.status(404).json({ error: 'export_file_missing' });
      }
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${r.rows[0].result_filename}"`);
      return res.sendFile(fp);
    } catch (err) {
      return res.status(500).json({ error: err?.message || 'ดาวน์โหลด export ล้มเหลว' });
    }
  });
}
