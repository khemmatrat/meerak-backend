/**
 * Smart Anti-Bypass — text normalization + built-in detectors + DB rule evaluation (PR-1).
 * Pure evaluation only; callers decide HTTP / Firestore / telemetry side-effects.
 */

import { maskPiiForLlm } from './piiMask.js';

const MAX_EVAL_LENGTH = 12000;
const MAX_REGEX_PATTERN_LEN = 256;
const MAX_KEYWORD_PATTERN_LEN = 200;

/** @typedef {'off'|'warn'|'block'} AntiBypassFilterMode */

/** Built-in keyword needles applied on compact text (spaces/hyphens stripped). */
const BUILTIN_COMPACT_NEEDLES = [
  ['line', 'social_line'],
  ['lineapp', 'social_line'],
  ['lineme', 'social_line'],
  ['line@', 'social_line'],
  ['tiktok', 'social_tiktok'],
  ['tiktok.com', 'social_tiktok'],
  ['instagram', 'social_instagram'],
  ['instagr', 'social_instagram'],
  ['facebook.com', 'social_facebook'],
  ['fb.com', 'social_facebook'],
  ['messenger', 'social_facebook'],
  ['whatsapp', 'social_whatsapp'],
  ['wa.me', 'social_whatsapp'],
  ['telegram', 'social_telegram'],
  ['t.me', 'social_telegram'],
];

export function getAntiBypassTextFilterMode() {
  const v = String(process.env.ANTI_BYPASS_TEXT_FILTER || 'off').toLowerCase();
  if (v === 'warn' || v === 'block') return v;
  return 'off';
}

/**
 * Collapse bypass spacing tricks for substring checks.
 */
export function normalizeAntiBypassText(input) {
  if (input == null) return { rawLower: '', compact: '', digitsOnly: '' };
  let s = String(input);
  if (s.length > MAX_EVAL_LENGTH) s = s.slice(0, MAX_EVAL_LENGTH);
  s = s.normalize('NFKC');
  const thDigits = ['๐', '๑', '๒', '๓', '๔', '๕', '๖', '๗', '๘', '๙'];
  for (let i = 0; i < 10; i++) {
    s = s.split(thDigits[i]).join(String(i));
  }
  s = s.replace(/[\u200B-\u200D\uFEFF]/g, '');
  const rawLower = s.toLowerCase();
  const compact = rawLower.replace(/\s+/g, '').replace(/[\u2013\u2014\-_.]/g, '');
  const digitsOnly = rawLower.replace(/\D/g, '');
  return { rawLower, compact, digitsOnly };
}

function uniq(arr) {
  return [...new Set(arr)];
}

function maskSnippet(snippet, maxLen = 48) {
  const t = String(snippet || '').slice(0, maxLen);
  return maskPiiForLlm(t);
}

export function runBuiltinDetectors(norm) {
  const matched = [];
  const reasons = [];

  const { compact, digitsOnly } = norm;

  // Thai mobile-style 10 digits (leading 0 + 89xxxxxxx etc.)
  if (/0[689]\d{8}/.test(digitsOnly)) {
    matched.push('[phone_th]');
    reasons.push('phone_th');
  }

  for (const [needle, reason] of BUILTIN_COMPACT_NEEDLES) {
    if (needle && compact.includes(needle)) {
      matched.push(needle.slice(0, 24));
      reasons.push(reason);
    }
  }

  // Suspicious handles on compact (narrow — IG/LINE style)
  if (/(?:^|[^a-z0-9])(?:line:|ig:|tiktok:|tt:|fb:|dm)(?:[a-z0-9_@.-]{2,})/i.test(norm.rawLower)) {
    matched.push('[handle_hint]');
    reasons.push('contact_handle_hint');
  }

  return { matched: uniq(matched), reasons: uniq(reasons) };
}

/**
 * Validate regex for anti-bypass use (reduce ReDoS / crashes).
 */
export function compileSafeAntiBypassRegex(pattern) {
  const p = String(pattern || '');
  if (!p || p.length > MAX_REGEX_PATTERN_LEN) {
    throw new Error(`regex pattern empty or exceeds ${MAX_REGEX_PATTERN_LEN} chars`);
  }
  let re;
  try {
    re = new RegExp(p, 'iu');
  } catch (e) {
    throw new Error(`invalid regex: ${e.message}`);
  }
  return re;
}

function evaluateDbRules(norm, dbRules, scopeFilter) {
  const matched = [];
  const reasons = [];
  const rows = Array.isArray(dbRules) ? dbRules : [];

  for (const row of rows) {
    if (row.enabled === false) continue;
    const sc = row.scope || 'text';
    if (sc !== scopeFilter) continue;

    const kind = row.kind;
    const pattern = String(row.pattern || '');
    const rid = row.id ? String(row.id).slice(0, 8) : 'rule';

    if (kind === 'keyword') {
      if (!pattern || pattern.length > MAX_KEYWORD_PATTERN_LEN) continue;
      const pn = normalizeAntiBypassText(pattern);
      const needle = pn.compact || pn.rawLower.replace(/\s+/g, '');
      if (!needle) continue;
      if (norm.compact.includes(needle)) {
        matched.push(`kw:${needle.slice(0, 16)}`);
        reasons.push(`rule_keyword:${rid}`);
      }
      continue;
    }

    if (kind === 'regex') {
      try {
        const re = compileSafeAntiBypassRegex(pattern);
        const hay = norm.rawLower.slice(0, MAX_EVAL_LENGTH);
        const hit = re.exec(hay);
        if (hit) {
          matched.push(`rx:${maskSnippet(hit[0], 32)}`);
          reasons.push(`rule_regex:${rid}`);
        }
      } catch {
        // Invalid regex rows should not crash evaluate — skip (admin fixes rule)
      }
    }
  }

  return { matched: uniq(matched), reasons: uniq(reasons) };
}

/**
 * @param {string} rawText
 * @param {{ filterMode?: AntiBypassFilterMode, dbRules?: any[], scope?: 'text'|'image_ocr' }} opts
 */
export function evaluateAntiBypassText(rawText, opts = {}) {
  const filterMode = opts.filterMode ?? getAntiBypassTextFilterMode();
  const scopeFilter = opts.scope === 'image_ocr' ? 'image_ocr' : 'text';
  const dbRules = opts.dbRules ?? [];

  const norm = normalizeAntiBypassText(rawText);
  const builtin = runBuiltinDetectors(norm);
  const custom = evaluateDbRules(norm, dbRules, scopeFilter);

  const matched = uniq([...builtin.matched, ...custom.matched]);
  const reasons = uniq([...builtin.reasons, ...custom.reasons]);
  const matchedMasked = matched.map((m) => maskSnippet(m, 56));

  if (filterMode === 'off') {
    return {
      allowed: true,
      blocked: false,
      warn: false,
      reasons: [],
      matchedMasked: [],
      filterMode,
      scope: scopeFilter,
    };
  }

  const hit = reasons.length > 0;

  if (filterMode === 'warn') {
    return {
      allowed: true,
      blocked: false,
      warn: hit,
      reasons: hit ? reasons : [],
      matchedMasked: hit ? matchedMasked : [],
      filterMode,
      scope: scopeFilter,
    };
  }

  // block
  if (hit) {
    return {
      allowed: false,
      blocked: true,
      warn: false,
      reasons,
      matchedMasked,
      filterMode,
      scope: scopeFilter,
      code: 'ANTI_BYPASS_BLOCKED',
    };
  }

  return {
    allowed: true,
    blocked: false,
    warn: false,
    reasons: [],
    matchedMasked: [],
    filterMode,
    scope: scopeFilter,
  };
}
