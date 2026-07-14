const DEFAULT_AGENT_ID = 'jarvis-prod-01';
const SDK_TIMEOUT_MS = 15;
const CIRCUIT_FAILURE_THRESHOLD = 5;
const CIRCUIT_WINDOW_MS = 10_000;
const CIRCUIT_OPEN_MS = 60_000;

let circuitFailures = 0;
let circuitWindowStart = 0;
let circuitOpenUntil = 0;

export function defaultAgentId() {
  return process.env.AGK_AGENT_ID || DEFAULT_AGENT_ID;
}

export function sdkTimeoutMs(env = process.env) {
  const n = Number(env.AGK_SDK_TIMEOUT_MS || SDK_TIMEOUT_MS);
  return Number.isFinite(n) && n > 0 ? n : SDK_TIMEOUT_MS;
}

export function isObserveEnabled(env = process.env) {
  const v = (env.AGK_OBSERVE || '').toLowerCase();
  if (v === '0' || v === 'false' || v === 'off') return false;
  if (v === '1' || v === 'true' || v === 'on') return true;
  return false;
}

/** Phase 1.2 — shadow firewall (alert only, never block). */
export function isFirewallShadowEnabled(env = process.env) {
  const v = (env.AGK_FIREWALL || '').toLowerCase();
  return v === 'shadow' || v === 'on' || v === '1' || v === 'true';
}

/** Phase 1.3 — hard policy enforcement (deny L1+/L2+ per policy). */
export function isPolicyEnforceEnabled(env = process.env) {
  const v = (env.AGK_POLICY || '').toLowerCase();
  return v === 'on' || v === 'enforce' || v === '1' || v === 'true';
}

export function resolveGuardianMode(env = process.env) {
  if (isPolicyEnforceEnabled(env)) return 'enforce';
  if (isFirewallShadowEnabled(env)) return 'shadow';
  if (isObserveEnabled(env)) return 'observe';
  return 'off';
}

export function shadowTimeoutMs(env = process.env) {
  const n = Number(env.AGK_SHADOW_TIMEOUT_MS || 25);
  return Number.isFinite(n) && n > 0 ? n : 25;
}

export function enforceTimeoutMs(env = process.env) {
  const n = Number(env.AGK_ENFORCE_TIMEOUT_MS || 25);
  return Number.isFinite(n) && n > 0 ? n : 25;
}

/** Phase 2 — ACP inter-agent bus via Guardian. */
export function isAcpEnabled(env = process.env) {
  const v = (env.AGK_ACP || 'on').toLowerCase();
  if (v === '0' || v === 'false' || v === 'off') return false;
  return true;
}

export function isKnowledgeEnabled(env = process.env) {
  const v = (env.AGK_KNOWLEDGE || 'on').toLowerCase();
  if (v === '0' || v === 'false' || v === 'off') return false;
  return true;
}

/** Phase 3 — hypervisor + scheduler. */
export function isHypervisorEnabled(env = process.env) {
  const v = (env.AGK_HYPERVISOR || 'on').toLowerCase();
  if (v === '0' || v === 'false' || v === 'off') return false;
  return true;
}

/** Phase 3.6 — canary % through AGK primary path (0–100). */
export function canaryPercent(env = process.env) {
  const n = Number(env.AGK_CANARY_PERCENT ?? 10);
  if (!Number.isFinite(n)) return 10;
  return Math.max(0, Math.min(100, Math.floor(n)));
}

export function resolveCanaryLane(userKey = '', traceId = '', env = process.env) {
  const pct = canaryPercent(env);
  if (pct >= 100) return 'canary';
  if (pct <= 0) return 'legacy';
  const key = `${userKey || 'anon'}:${traceId || ''}`;
  const hash = cryptoHash(key) % 100;
  return hash < pct ? 'canary' : 'legacy';
}

function cryptoHash(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = (h * 31 + str.charCodeAt(i)) >>> 0;
  }
  return h;
}

/** Phase 3.6 — parallel shadow compare on every request. */
export function isShadowCompareEnabled(env = process.env) {
  const v = (env.AGK_SHADOW_COMPARE || 'on').toLowerCase();
  if (v === '0' || v === 'false' || v === 'off') return false;
  return true;
}

/** Phase 3.6 — block hard enforce until confidence >= gate. */
export function isConfidenceGated(env = process.env) {
  const v = (env.AGK_CONFIDENCE_GATE || '').toLowerCase();
  if (v === 'off' || v === '0' || v === 'false') return false;
  return env.AGK_POLICY === 'confidence' || env.AGK_CONFIDENCE === 'on';
}

export function guardianApiBase(env = process.env) {
  const url = env.GUARDIAN_API_URL || env.AGK_API_URL || '';
  return url.replace(/\/$/, '');
}

export function isCircuitOpen(now = Date.now()) {
  return now < circuitOpenUntil;
}

export function recordCircuitFailure(now = Date.now()) {
  if (now - circuitWindowStart > CIRCUIT_WINDOW_MS) {
    circuitWindowStart = now;
    circuitFailures = 0;
  }
  circuitFailures += 1;
  if (circuitFailures >= CIRCUIT_FAILURE_THRESHOLD) {
    circuitOpenUntil = now + CIRCUIT_OPEN_MS;
    circuitFailures = 0;
    circuitWindowStart = now;
  }
}

export function recordCircuitSuccess() {
  circuitFailures = 0;
  circuitOpenUntil = 0;
}
