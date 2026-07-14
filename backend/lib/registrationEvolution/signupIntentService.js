/**
 * Signup intent persistence + lifecycle (V2-only; no V1 coupling).
 * Phase 2.5: transition guards, signed tokens, flow versioning, metrics.
 */

import crypto from 'crypto';
import { getRegistrationEvolutionFeatureFlags, parseEnvBoolean } from './featureFlags.js';
import {
  SIGNUP_INTENT_STATES,
  getSignupIntentTtlMinutesResolved,
  SIGNUP_INTENT_TRANSITION_EVENT,
  isTransitionAllowed,
  SIGNUP_FLOW_VERSION,
} from './signupIntentConstants.js';
import { signIntentAccessToken, verifyIntentAccessToken, isSignedTokenModeActive } from './signupIntentTokens.js';
import { emitIntentMetric } from './signupIntentMetrics.js';

function normalizeIntentPhone(phone) {
  if (!phone || typeof phone !== 'string') return '';
  let p = phone.trim().replace(/[\s\-\(\)]/g, '').replace(/^\+/, '');
  if (p.startsWith('66') && p.length >= 10) return '0' + p.slice(2);
  if (p.startsWith('0') && p.length === 10) return p;
  if (p.length === 9 && !p.startsWith('0')) return '0' + p;
  return p;
}

function timingSafeEqualStr(a, b) {
  const x = Buffer.from(String(a || ''), 'utf8');
  const y = Buffer.from(String(b || ''), 'utf8');
  if (!x.byteLength || x.byteLength !== y.byteLength) return false;
  try {
    return crypto.timingSafeEqual(x, y);
  } catch (_) {
    return false;
  }
}

function headerOne(req, names) {
  if (!req?.headers) return '';
  for (const n of names) {
    const raw = req.headers[n];
    const v =
      typeof raw === 'string' ? raw : Array.isArray(raw) ? String(raw[0] || '') : '';
    const t = v.trim();
    if (t) return t.slice(0, 200);
  }
  return '';
}

function readIntentIdempotencyKey(req) {
  const h = headerOne(req, [
    'idempotency-key',
    'x-idempotency-key',
    'x-signup-intent-idempotency-key',
  ]);
  if (h) return h.slice(0, 160);
  const b = req.body?.idempotency_key != null ? String(req.body.idempotency_key).trim() : '';
  return b ? b.slice(0, 160) : '';
}

function newRecoveryToken() {
  return crypto.randomBytes(24).toString('base64url');
}

function emitTransitionStdout(meta) {
  try {
    if (!parseEnvBoolean(process.env.SIGNUP_INTENT_TRANSITION_STDOUT, false)) return;
    console.log(
      JSON.stringify({
        ts: new Date().toISOString(),
        event: SIGNUP_INTENT_TRANSITION_EVENT,
        ...meta,
      }),
    );
  } catch (_) {
    /* noop */
  }
}

async function insertIntentEvent(client, intentId, fromState, toState, meta) {
  const enriched = { ...(meta || {}), flow_version: meta?.flow_version || SIGNUP_FLOW_VERSION };
  await client.query(
    `INSERT INTO signup_intent_events (intent_id, from_state, to_state, meta) VALUES ($1::uuid, $2, $3, $4::jsonb)`,
    [intentId, fromState, toState, JSON.stringify(enriched)],
  );
  emitTransitionStdout({
    intent_id: intentId,
    from_state: fromState,
    to_state: toState,
    meta: enriched,
  });
}

/**
 * Increment retry_count + append idempotent replay event (same txn).
 * @returns {Promise<import('pg').QueryResultRow | null>}
 */
async function bumpPendingIntentReplay(pool, intentId) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const r2 = await client.query(
      `UPDATE signup_intents SET retry_count = retry_count + 1, updated_at = NOW()
       WHERE intent_id = $1::uuid AND state = 'pending' RETURNING *`,
      [intentId],
    );
    if (!r2.rows?.length) {
      await client.query('ROLLBACK');
      return null;
    }
    const row = r2.rows[0];
    await insertIntentEvent(client, row.intent_id, null, SIGNUP_INTENT_STATES.PENDING, {
      kind: 'idempotent_replay',
      retry_increment: true,
      flow_version: SIGNUP_FLOW_VERSION,
    });
    await client.query('COMMIT');
    emitIntentMetric('intent_replay', { intent_id: intentId });
    return row;
  } catch (e) {
    try {
      await client.query('ROLLBACK');
    } catch (_) {
      /* noop */
    }
    throw e;
  } finally {
    client.release();
  }
}

/**
 * If a pending row exists for this idempotency key, lazy-expire then bump replay (or null).
 * @returns {Promise<{ status: number, body: Record<string, unknown> } | null>}
 */
async function tryServeIdempotentReplay(pool, idempotencyKey) {
  if (!idempotencyKey) return null;
  const ex = await pool
    .query(
      `SELECT * FROM signup_intents WHERE idempotency_key = $1 AND state = $2 LIMIT 1`,
      [idempotencyKey, SIGNUP_INTENT_STATES.PENDING],
    )
    .catch(() => ({ rows: [] }));
  let row = ex.rows?.[0];
  if (!row) return null;
  row = await lazyExpireSignupIntentIfNeeded(pool, row);
  if (row.state !== SIGNUP_INTENT_STATES.PENDING) return null;
  const bumped = await bumpPendingIntentReplay(pool, row.intent_id);
  if (!bumped) return null;
  row = bumped;
  return {
    status: 200,
    body: {
      intent_id: row.intent_id,
      state: row.state,
      retry_count: row.retry_count,
      expires_at: row.expires_at,
      source_platform: row.source_platform,
      embedded_browser: row.embedded_browser,
      idempotent_replay: true,
      /** recovery_token re-issued only on fresh creates — do not rotate on replay to keep client stable */
      recovery_token: row.recovery_token,
    },
  };
}

/**
 * @param {import('pg').Pool} pool
 * @param {string} intentId
 * @param {string} fromState
 * @param {string} toState
 * @param {Record<string, unknown>} meta
 */
export async function transitionSignupIntentState(pool, intentId, fromState, toState, meta = {}) {
  if (!isTransitionAllowed(fromState, toState)) {
    emitIntentMetric('intent_invalid_transition', { intent_id: intentId, from: fromState, to: toState });
    emitTransitionStdout({
      intent_id: intentId,
      from_state: fromState,
      to_state: toState,
      rejected: true,
      reason: 'transition_not_allowed',
      meta,
    });
    try {
      await pool.query(
        `INSERT INTO signup_intent_events (intent_id, from_state, to_state, meta) VALUES ($1::uuid, $2, $3, $4::jsonb)`,
        [intentId, fromState, toState, JSON.stringify({ ...meta, kind: 'invalid_transition_attempt', rejected: true, flow_version: SIGNUP_FLOW_VERSION })],
      );
    } catch (_) { /* best-effort audit */ }
    return null;
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const u = await client.query(
      `UPDATE signup_intents
       SET state = $1, updated_at = NOW()
       WHERE intent_id = $2::uuid AND state = $3
       RETURNING *`,
      [toState, intentId, fromState],
    );
    if (!u.rows.length) {
      await client.query('ROLLBACK');
      return null;
    }
    await insertIntentEvent(client, intentId, fromState, toState, { ...meta, flow_version: SIGNUP_FLOW_VERSION });
    await client.query('COMMIT');
    return u.rows[0];
  } catch (e) {
    try {
      await client.query('ROLLBACK');
    } catch (_) {
      /* noop */
    }
    throw e;
  } finally {
    client.release();
  }
}

/**
 * Lazy expiration on read paths (no cron required for Phase 2).
 */
export async function lazyExpireSignupIntentIfNeeded(pool, row) {
  if (!row || row.state !== SIGNUP_INTENT_STATES.PENDING) return row;
  const exp = new Date(row.expires_at).getTime();
  if (Number.isNaN(exp) || exp > Date.now()) return row;
  const next = await transitionSignupIntentState(
    pool,
    row.intent_id,
    SIGNUP_INTENT_STATES.PENDING,
    SIGNUP_INTENT_STATES.EXPIRED,
    { reason: 'ttl_elapsed_lazy', flow_version: SIGNUP_FLOW_VERSION },
  );
  emitIntentMetric('intent_expired_lazy', { intent_id: row.intent_id });
  return next || { ...row, state: SIGNUP_INTENT_STATES.EXPIRED };
}

function sanitizePlatform(s) {
  const t = String(s || '').trim().toLowerCase().slice(0, 32);
  if (/^[a-z0-9_-]+$/.test(t)) return t || null;
  return null;
}

function coerceEmbeddedBool(body, req) {
  if (body?.embedded_browser === true || body?.embedded_browser === false)
    return Boolean(body.embedded_browser);
  const h = headerOne(req, ['x-embedded-browser', 'x-signup-embedded-browser']).toLowerCase();
  if (h === '1' || h === 'true' || h === 'yes') return true;
  return false;
}

/**
 * POST /api/signup-intents handler core.
 *
 * @param {import('pg').Pool} pool
 */
export async function signupIntentHttpCreate(pool, req) {
  if (!getRegistrationEvolutionFeatureFlags().ENABLE_SIGNUP_INTENTS) {
    return { status: 404, body: { error: 'Not found' } };
  }

  const body = req.body || {};
  const phoneNorm = normalizeIntentPhone(body.phone != null ? String(body.phone) : '');
  if (!phoneNorm || phoneNorm.length < 9) {
    return { status: 400, body: { error: 'Valid phone required' } };
  }

  const source_platform = sanitizePlatform(body.source_platform) || sanitizePlatform(headerOne(req, ['x-client-platform', 'x-aqond-client-platform']));
  const embedded_browser = coerceEmbeddedBool(body, req);
  const idempotencyKey = readIntentIdempotencyKey(req);

  const earlyReplay = await tryServeIdempotentReplay(pool, idempotencyKey);
  if (earlyReplay) return earlyReplay;

  const ttlMin = getSignupIntentTtlMinutesResolved();
  const expiresAt = new Date(Date.now() + ttlMin * 60 * 1000).toISOString();
  const recovery_token = newRecoveryToken();
  const flowVersion = body.flow_version || SIGNUP_FLOW_VERSION;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const ins = await client.query(
      `INSERT INTO signup_intents
        (phone, state, source_platform, embedded_browser, retry_count, recovery_token, idempotency_key, expires_at, flow_version)
       VALUES ($1, $2, $3, $4, 0, $5, $6, $7, $8)
       RETURNING *`,
      [
        phoneNorm,
        SIGNUP_INTENT_STATES.PENDING,
        source_platform,
        embedded_browser,
        recovery_token,
        idempotencyKey || null,
        expiresAt,
        flowVersion,
      ],
    );
    const row = ins.rows[0];
    await insertIntentEvent(client, row.intent_id, null, SIGNUP_INTENT_STATES.PENDING, {
      kind: 'created',
      ttl_minutes: ttlMin,
      flow_version: flowVersion,
    });
    await client.query('COMMIT');

    emitIntentMetric('intent_created', { intent_id: row.intent_id });

    const accessToken = isSignedTokenModeActive()
      ? signIntentAccessToken(row.intent_id, row.recovery_token, row.expires_at)
      : row.recovery_token;

    if (isSignedTokenModeActive()) emitIntentMetric('signed_token_issued');

    return {
      status: 201,
      body: {
        intent_id: row.intent_id,
        state: row.state,
        retry_count: row.retry_count,
        expires_at: row.expires_at,
        source_platform: row.source_platform,
        embedded_browser: row.embedded_browser,
        recovery_token: accessToken,
        flow_version: row.flow_version || flowVersion,
      },
    };
  } catch (e) {
    try {
      await client.query('ROLLBACK');
    } catch (_) {
      /* noop */
    }
    /** Partial unique race: concurrent pending insert with same idempotency key */
    if (idempotencyKey && String(e?.code || '') === '23505') {
      const raceReplay = await tryServeIdempotentReplay(pool, idempotencyKey);
      if (raceReplay) return raceReplay;
    }
    console.error('[signup-intents] create failed', e?.message || e);
    return { status: 500, body: { error: 'Failed to create signup intent' } };
  } finally {
    client.release();
  }
}

/**
 * GET /api/signup-intents/:id/status
 */
export async function signupIntentHttpStatus(pool, req) {
  if (!getRegistrationEvolutionFeatureFlags().ENABLE_SIGNUP_INTENTS) {
    return { status: 404, body: { error: 'Not found' } };
  }

  const intentId = String(req.params?.id || '').trim();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(intentId)) {
    return { status: 404, body: { error: 'Not found' } };
  }

  const token =
    (req.query?.token != null ? String(req.query.token) : '').trim() ||
    headerOne(req, ['x-signup-recovery-token', 'x-recovery-token']);

  if (!token) {
    return { status: 400, body: { error: 'recovery token required' } };
  }

  let rawRecoveryToken = token;

  if (isSignedTokenModeActive()) {
    const verification = verifyIntentAccessToken(token, intentId);
    if (!verification.valid) {
      emitIntentMetric('signed_token_rejected', { reason: verification.reason });
      return { status: 404, body: { error: 'Not found' } };
    }
    rawRecoveryToken = verification.rawRecoveryToken;
    emitIntentMetric('signed_token_verified');
  }

  const q = await pool
    .query(`SELECT * FROM signup_intents WHERE intent_id = $1::uuid LIMIT 1`, [intentId])
    .catch(() => ({ rows: [] }));
  const row0 = q.rows?.[0];
  if (!row0 || !timingSafeEqualStr(row0.recovery_token, rawRecoveryToken)) {
    emitIntentMetric('recovery_failed');
    return { status: 404, body: { error: 'Not found' } };
  }

  emitIntentMetric('recovery_success');

  try {
    await pool.query(
      `INSERT INTO signup_intent_events (intent_id, from_state, to_state, meta) VALUES ($1::uuid, $2, $2, $3::jsonb)`,
      [intentId, row0.state, JSON.stringify({ kind: 'recovery_access', flow_version: SIGNUP_FLOW_VERSION })],
    );
  } catch (_) { /* best-effort audit */ }

  let row = await lazyExpireSignupIntentIfNeeded(pool, row0);
  return {
    status: 200,
    body: {
      intent_id: row.intent_id,
      state: row.state,
      retry_count: row.retry_count,
      expires_at: row.expires_at,
      source_platform: row.source_platform,
      embedded_browser: row.embedded_browser,
      created_at: row.created_at,
      updated_at: row.updated_at,
      flow_version: row.flow_version || null,
    },
  };
}
