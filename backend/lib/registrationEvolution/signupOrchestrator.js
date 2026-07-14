/**
 * Phase 1 — Signup traffic orchestrator (classification + tracing; V1 unchanged by default).
 *
 * CONTRACT:
 * - Default lane = primary V1 (100% traffic). No migration, no rewrite of legacy handler semantics.
 * - V2 Dark path activates ONLY with ENABLE_SIGNUP_TRAFFIC_ROUTER + valid INTERNAL_KEY headers (operators only).
 * - Any orchestrator fault → callers must ignore and continue V1 (fail-open).
 */

import crypto from 'crypto';
import { getRegistrationEvolutionFeatureFlags, parseEnvBoolean } from './featureFlags.js';

export const SIGNUP_ORCHESTRATION_EVENT = 'signup_orchestration';
export const SIGNUP_ORCHESTRATION_SCHEMA = 'orchestration_v1';

function headerTrim(req, names) {
  if (!req || !req.headers) return '';
  for (const name of names) {
    const raw = req.headers[name];
    const v =
      typeof raw === 'string' ? raw : Array.isArray(raw) ? String(raw[0] || '') : '';
    const t = v.trim();
    if (t) return t.slice(0, 500);
  }
  return '';
}

function randomUuid() {
  try {
    if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  } catch (_) { /* noop */ }
  return crypto.randomBytes(16).toString('hex');
}

function timingSafeEqualStr(secret, probe) {
  const a = Buffer.from(String(secret || ''), 'utf8');
  const b = Buffer.from(String(probe || ''), 'utf8');
  if (!a.byteLength || a.byteLength !== b.byteLength) return false;
  try {
    return crypto.timingSafeEqual(a, b);
  } catch (_) {
    return false;
  }
}

function uaClassifyEmbedded(userAgent) {
  const ua = String(userAgent || '');
  return /FBAN|FBAV|FB_IAB|Instagram|LINE\/|; wv\b|TikTok|Messenger\b|\bwv\b\)/i.test(
    ua,
  );
}

/** Web / ios / android / unknown — heuristic + explicit client header wins. */
function detectPlatformBucket(req) {
  const hinted = headerTrim(req, ['x-client-platform', 'x-aqond-client-platform']).toLowerCase();
  if (hinted.includes('ios') || hinted.includes('iphone') || hinted.includes('ipad'))
    return 'ios';
  if (hinted.includes('android')) return 'android';
  if (
    hinted.includes('web') ||
    hinted.includes('pwa') ||
    hinted.includes('browser') ||
    hinted.includes('capacitor')
  )
    return 'web';

  const ua = String(req.headers?.['user-agent'] || '').toLowerCase();
  if (/iphone|ipad|ipod|ios\b/.test(ua)) return 'ios';
  if (/android\b/.test(ua)) return 'android';
  if (/electron|webview|wv\b/.test(ua)) return 'web';
  return 'unknown';
}

function parseRetryChainId(req) {
  return (
    headerTrim(req, [
      'x-signup-retry-chain-id',
      'x-registration-retry-chain-id',
      'x-aqond-retry-chain-id',
    ]).slice(0, 200) ||
    ''
  );
}

function resolveRequestId(req) {
  const fromHeader = headerTrim(req, ['x-request-id', 'x-correlation-id', 'x-amzn-requestid']).slice(
    0,
    120,
  );
  return fromHeader || randomUuid();
}

/**
 * Canary projection only — DOES NOT reroute HTTP traffic automatically (Phase 1).
 * Geography from optional env SIGNUP_CANARY_GEO_HEADERS (comma list of ISO-ish hints checked against header x-forwarded-country or cf-ipcountry fallback).
 */
function buildCanaryHints(req, flags, platformBucket, embeddedHint) {
  const routerOn = !!(flags && flags.ENABLE_SIGNUP_TRAFFIC_ROUTER);
  const percentCapRaw = parseInt(process.env.SIGNUP_TRAFFIC_ROUTER_CANARY_MAX_PERCENT || '0', 10);
  const percentCap = Number.isFinite(percentCapRaw) ? Math.max(0, Math.min(100, percentCapRaw)) : 0;

  const geographyHeaderKeys = String(process.env.SIGNUP_CANARY_GEO_HEADERS || '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);

  let geographyHint = '';
  for (const key of geographyHeaderKeys) {
    const v =
      typeof req.headers?.[key] === 'string' ? req.headers[key].trim() : '';
    if (v) {
      geographyHint = v.slice(0, 32);
      break;
    }
  }

  /** Deterministic pseudo-bucket — future percentage routing can reuse (not applied to lane in Phase 1). */
  const rid = resolveRequestId(req);
  let hashBucket = 0;
  try {
    const h = crypto.createHash('sha256').update(rid).digest();
    hashBucket = h.readUInt32BE(0) % 100;
  } catch (_) {
    hashBucket = 0;
  }

  return Object.freeze({
    router_enabled: routerOn,
    percent_cap_reserved: percentCap,
    percent_hash_bucket_reserved: hashBucket,
    geography_hint: geographyHint || undefined,
    platform_bucket: platformBucket,
    embedded_ua_hint: embeddedHint,
    /** Explicitly false until a later phase computes eligibility from rollout rules. */
    would_route_experimental_reserved: false,
  });
}

/**
 * Recovery routing hint — observability only until recovery V2 consumes it.
 */
function recoveryRoutingHint(req) {
  const h = parseEnvBoolean(headerTrim(req, ['x-signup-recovery-intent']), undefined);
  if (h === true) return 'recovery_intent_header_true';
  if (h === false) return 'recovery_intent_header_false';
  const q = req.method === 'GET' ? req.query : undefined;
  if (q && (q.signup_recovery === '1' || q.recovery === '1')) return 'recovery_query_hint';
  return 'none';
}

/**
 * V2 Dark eligibility — INTERNAL ONLY; never activates for absence of secrets.
 */
function evaluateV2DarkEligibility(req, flags) {
  if (!flags.ENABLE_SIGNUP_TRAFFIC_ROUTER) {
    return { eligible: false, reason: 'router_flag_off' };
  }
  const expected = process.env.SIGNUP_ORCHESTRATOR_INTERNAL_KEY;
  if (!expected || typeof expected !== 'string' || expected.trim().length < 16) {
    return { eligible: false, reason: 'internal_key_unconfigured_short' };
  }
  const offered = headerTrim(req, ['x-aqond-signup-internal-key', 'x-signup-internal-key']);
  const lane = headerTrim(req, ['x-aqond-signup-lane']).toLowerCase();
  if (lane !== 'v2_dark') {
    return { eligible: false, reason: 'lane_not_v2_dark' };
  }
  if (!timingSafeEqualStr(expected.trim(), offered)) {
    return { eligible: false, reason: 'internal_key_mismatch' };
  }
  return { eligible: true, reason: 'dark_internal_gate_ok' };
}

/**
 * @typedef {ReturnType<typeof orchestrateSignupEntry>} SignupOrchestrationPlan
 */

/**
 * Synchronous orchestration plan — safe to invoke at top of /api/auth/register.
 * NEVER throws intentionally.
 *
 * @param {*} req Express req
 */
export function orchestrateSignupEntry(req) {
  const flags = getRegistrationEvolutionFeatureFlags();

  /** @type {ReturnType<typeof detectPlatformBucket>} */
  let platformBucket = 'unknown';
  /** @type {boolean} */
  let embeddedUa = false;

  try {
    platformBucket = detectPlatformBucket(req);
    embeddedUa = uaClassifyEmbedded(req.headers?.['user-agent']);
  } catch (_) {
    platformBucket = 'unknown';
    embeddedUa = false;
  }

  const request_id = resolveRequestId(req);
  const retry_chain_id =
    parseRetryChainId(req) ||
    headerTrim(req, ['idempotency-key', 'x-idempotency-key']).slice(0, 160) ||
    '';

  /** Default — 100% real traffic stays V1. */
  let traffic_lane = 'primary_v1';
  let signup_flow_version = 'v1';

  const dark = evaluateV2DarkEligibility(req, flags);
  if (dark.eligible) {
    traffic_lane = 'experimental_v2_dark';
    signup_flow_version = 'v2_dark';
  }

  const classification = Object.freeze({
    platform_bucket: platformBucket,
    embedded_browser_hint: embeddedUa,
    recovery_routing_hint: recoveryRoutingHint(req),
    router_flag_on: !!(flags && flags.ENABLE_SIGNUP_TRAFFIC_ROUTER),
    dark_gate_reason: dark.reason,
    /** Future: intents / recovery v2 reuse */
    intents_flag_on: !!(flags && flags.ENABLE_SIGNUP_INTENTS),
    embedded_mode_flag_on: !!(flags && flags.ENABLE_EMBEDDED_BROWSER_MODE),
  });

  const canary = buildCanaryHints(req, flags, platformBucket, embeddedUa);

  const trace = Object.freeze({
    request_id,
    signup_flow_version,
    traffic_lane,
    retry_chain_id: retry_chain_id || undefined,
  });

  return Object.freeze({
    lane: signup_flow_version === 'v2_dark' ? 'v2_dark' : 'v1',
    trace,
    classification,
    canary,
    v2_dark_eligible: dark.eligible,
  });
}

/**
 * Structured orchestration logs — gated by SIGNUP_ORCHESTRATION_LOGGING (default false → no stdout delta).
 *
 * @param {SignupOrchestrationPlan | null} plan
 */
export function logSignupOrchestrationDecision(plan) {
  try {
    if (!plan) return;
    if (!parseEnvBoolean(process.env.SIGNUP_ORCHESTRATION_LOGGING, false)) return;
    console.log(
      JSON.stringify({
        ts: new Date().toISOString(),
        event: SIGNUP_ORCHESTRATION_EVENT,
        schema: SIGNUP_ORCHESTRATION_SCHEMA,
        request_id: plan.trace.request_id,
        signup_flow_version: plan.trace.signup_flow_version,
        traffic_lane: plan.trace.traffic_lane,
        retry_chain_id: plan.trace.retry_chain_id,
        classification: plan.classification,
        canary: plan.canary,
        v2_dark_eligible: plan.v2_dark_eligible,
      }),
    );
  } catch (_) {
    /* deliberate fail silent */
  }
}

/**
 * Non-destructive V2-dark probe reply — INTERNAL ONLY lane; never mints JWT / user.
 *
 * @param {*} res Express res
 * @param {SignupOrchestrationPlan} plan
 * @returns {boolean} wrote response
 */
export function respondSignupV2DarkInternalProbe(req, res, plan) {
  try {
    if (!res || res.headersSent || res.writableEnded) return false;
    if (!plan || plan.lane !== 'v2_dark' || !plan.v2_dark_eligible) return false;

    const body = Object.freeze({
      signup_orchestration_probe: true,
      request_id: plan.trace.request_id,
      signup_flow_version: plan.trace.signup_flow_version,
      traffic_lane: plan.trace.traffic_lane,
      retry_chain_id: plan.trace.retry_chain_id,
      classification: plan.classification,
      /** Present for rollout dry-runs — not a successful registration payload. */
      message: 'v2_dark_path_internal_only_no_user_created',
    });

    /** Response headers aid tracing in curl / internal gateways */
    try {
      res.setHeader('x-signup-flow-version', String(plan.trace.signup_flow_version).slice(0, 48));
      res.setHeader('x-signup-traffic-lane', String(plan.trace.traffic_lane).slice(0, 64));
      res.setHeader('x-request-id', String(plan.trace.request_id).slice(0, 120));
    } catch (_) {
      /* ignore header failures */
    }

    res.status(200).json(body);
    return true;
  } catch (_) {
    /* fail-open: let caller proceed to V1 */
    return false;
  }
}

/**
 * Convenience: top-of-route hook with fail-open.
 *
 * @returns {boolean} true if response already finished (dark probe)
 */
export function signupRegisterEntryOrchestration(req, res) {
  try {
    if (!res || res.headersSent || res.writableEnded) return false;
    const plan = orchestrateSignupEntry(req);
    /** Attach for downstream metrics / optional future middleware (opaque to V1). */
    req.signup_orchestration = plan;
    logSignupOrchestrationDecision(plan);

    if (plan.lane === 'v2_dark' && plan.v2_dark_eligible) {
      const sent = respondSignupV2DarkInternalProbe(req, res, plan);
      if (sent) return true;
    }
  } catch (_) {
    /* fail-open silently */
  }
  return false;
}
