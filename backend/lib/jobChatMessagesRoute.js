/**
 * Smart Anti-Bypass PR-2 — proxied job chat messages (Firestore parity path).
 * POST /api/jobs/:jobId/chat/messages
 */

import {
  evaluateAntiBypassText,
  getAntiBypassTextFilterMode,
} from './antiBypassTextFilter.js';
import { recordAntiBypassReasons } from './antiBypassTelemetry.js';

const ALLOWED_TYPES = new Set(['text', 'image', 'audio', 'system']);

export function isJobChatProxyEnabledServer() {
  return (
    String(process.env.ANTI_BYPASS_JOB_CHAT_PROXY || '').toLowerCase().trim() ===
    'on'
  );
}

export async function fetchEnabledAntiBypassRules(pool) {
  try {
    const r = await pool.query(
      `SELECT id, kind, scope, pattern, enabled FROM anti_bypass_rules WHERE enabled = true`,
    );
    return r.rows || [];
  } catch (e) {
    if (e?.code === '42P01') return [];
    throw e;
  }
}

/**
 * Employer/provider on regular jobs or advance_jobs only (matches chat UI usage).
 */
export async function assertUserMayPostJobChat(pool, jobId, tokenUserId) {
  const uidRes = await pool.query(
    `SELECT id::text AS id, COALESCE(firebase_uid::text, '') AS firebase_uid
     FROM users WHERE id::text = $1 OR firebase_uid = $1 LIMIT 1`,
    [tokenUserId],
  );
  if (!uidRes.rows?.length) {
    return {
      ok: false,
      status: 403,
      code: 'USER_NOT_FOUND',
      error: 'ไม่พบผู้ใช้',
    };
  }
  const uid = String(uidRes.rows[0].id);
  const fb = uidRes.rows[0].firebase_uid
    ? String(uidRes.rows[0].firebase_uid)
    : '';

  const jobRes = await pool.query(
    `SELECT created_by::text AS created_by, accepted_by::text AS accepted_by,
            client_id::text AS client_id
     FROM jobs WHERE id::text = $1 LIMIT 1`,
    [jobId],
  );
  if (jobRes.rows?.length) {
    const row = jobRes.rows[0];
    const created = row.created_by != null ? String(row.created_by) : '';
    const accepted = row.accepted_by != null ? String(row.accepted_by) : '';
    const clientId = row.client_id != null ? String(row.client_id) : '';
    if (
      uid === accepted ||
      uid === clientId ||
      uid === created ||
      (fb && (fb === accepted || fb === created))
    ) {
      return { ok: true };
    }
  }

  const advRes = await pool.query(
    `SELECT employer_id::text AS employer_id, hired_user_id::text AS hired_user_id
     FROM advance_jobs WHERE id::text = $1 LIMIT 1`,
    [jobId],
  );
  if (advRes.rows?.length) {
    const row = advRes.rows[0];
    const emp = row.employer_id != null ? String(row.employer_id) : '';
    const hired = row.hired_user_id != null ? String(row.hired_user_id) : '';
    if (uid === emp || uid === hired || (fb && fb === emp)) {
      return { ok: true };
    }
  }

  return {
    ok: false,
    status: 403,
    code: 'JOB_CHAT_FORBIDDEN',
    error: 'ไม่มีสิทธิ์ส่งข้อความในงานนี้',
  };
}

async function ensureFirebaseAdminApp() {
  const admin = await import('firebase-admin');
  if (!admin.apps || admin.apps.length === 0) {
    if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
      admin.initializeApp({ credential: admin.credential.applicationDefault() });
    } else if (process.env.FIREBASE_SERVICE_ACCOUNT) {
      const sa = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
      admin.initializeApp({ credential: admin.credential.cert(sa) });
    } else {
      const projectId =
        process.env.FIREBASE_PROJECT_ID || process.env.VITE_FIREBASE_PROJECT_ID;
      const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
      const privateKey = (process.env.FIREBASE_PRIVATE_KEY || '').replace(
        /\\n/g,
        '\n',
      );
      if (projectId && clientEmail && privateKey) {
        admin.initializeApp({
          credential: admin.credential.cert({
            projectId,
            clientEmail,
            privateKey,
          }),
        });
      } else {
        const err = new Error('Firebase Admin credentials not configured');
        err.code = 'FIREBASE_ADMIN_UNAVAILABLE';
        throw err;
      }
    }
  }
  return admin;
}

/** Writes chats/{jobId}/messages — payload already sanitized (no undefined). */
export async function writeJobChatMessage(jobId, payload) {
  const admin = await ensureFirebaseAdminApp();
  const db = admin.firestore();
  const ref = await db.collection('chats').doc(jobId).collection('messages').add(payload);
  return ref.id;
}

/**
 * @param {import('express').Express} app
 * @param {import('pg').Pool} pool
 * @param {(req: any, res: any, next: any) => void} authenticateTokenMiddleware
 */
export function registerJobChatMessagesRoute(app, pool, authenticateTokenMiddleware) {
  app.post(
    '/api/jobs/:jobId/chat/messages',
    authenticateTokenMiddleware,
    async (req, res) => {
      try {
        if (!isJobChatProxyEnabledServer()) {
          return res.status(503).json({
            error: 'Job chat proxy is disabled',
            code: 'JOB_CHAT_PROXY_DISABLED',
          });
        }

        const jobId = String(req.params.jobId || '').trim();
        if (!jobId) {
          return res.status(400).json({
            error: 'ต้องระบุ jobId',
            code: 'BAD_REQUEST',
          });
        }

        const userId = req.user?.id ? String(req.user.id) : '';
        if (!userId) {
          return res.status(401).json({ error: 'กรุณาเข้าสู่ระบบก่อน' });
        }

        const authz = await assertUserMayPostJobChat(pool, jobId, userId);
        if (!authz.ok) {
          return res.status(authz.status).json({
            error: authz.error,
            code: authz.code || 'FORBIDDEN',
          });
        }

        const body = req.body || {};
        let type = body.type != null ? String(body.type).toLowerCase() : 'text';
        if (!ALLOWED_TYPES.has(type)) type = 'text';

        const textRaw = body.text != null ? String(body.text) : '';
        let mediaUrl =
          body.media_url != null && String(body.media_url).trim()
            ? String(body.media_url).trim()
            : undefined;
        if (type === 'image' && !mediaUrl && textRaw.trim()) {
          mediaUrl = textRaw.trim();
        }

        const evalParts = [textRaw];
        if (mediaUrl) evalParts.push(mediaUrl);
        const evalSource = evalParts.join('\n');

        const dbRules = await fetchEnabledAntiBypassRules(pool);
        const filterMode = getAntiBypassTextFilterMode();
        const evalResult = evaluateAntiBypassText(evalSource, {
          filterMode,
          dbRules,
          scope: 'text',
        });

        if (evalResult.blocked) {
          recordAntiBypassReasons(evalResult.scope, evalResult.reasons);
          return res.status(403).json({
            error: 'ข้อความไม่ผ่านการตรวจสอบความปลอดภัย',
            code: evalResult.code || 'ANTI_BYPASS_BLOCKED',
            reasons: evalResult.reasons,
            matchedMasked: evalResult.matchedMasked,
          });
        }

        if (evalResult.warn) {
          recordAntiBypassReasons(evalResult.scope, evalResult.reasons);
        }

        const nowIso = new Date().toISOString();
        /** Same shape as mobile/services/mockApi.ts sendMessage + sanitize(). */
        const payload = {
          sender_id: userId,
          type,
          text: textRaw || '',
          timestamp: nowIso,
          created_at: nowIso,
        };
        if (type === 'image') {
          const url = mediaUrl || textRaw || '';
          payload.text = url;
          if (url) payload.media_url = url;
        }

        let messageId;
        try {
          messageId = await writeJobChatMessage(jobId, payload);
        } catch (fe) {
          if (fe?.code === 'FIREBASE_ADMIN_UNAVAILABLE') {
            return res.status(503).json({
              error: 'การบันทึกข้อความชั่วคราวไม่พร้อม',
              code: 'FIRESTORE_UNAVAILABLE',
            });
          }
          console.error('[job-chat-proxy] Firestore write failed:', fe?.message || fe);
          return res.status(500).json({
            error: 'ไม่สามารถบันทึกข้อความได้',
            code: 'WRITE_FAILED',
          });
        }

        const response = {
          success: true,
          message_id: messageId,
        };
        if (evalResult.warn) {
          response.anti_bypass_warn = {
            reasons: evalResult.reasons,
            matchedMasked: evalResult.matchedMasked,
          };
        }
        return res.status(201).json(response);
      } catch (e) {
        console.error('[job-chat-proxy] unexpected:', e?.message || e);
        return res.status(500).json({
          error: 'Request failed',
          code: 'INTERNAL_ERROR',
        });
      }
    },
  );
}
