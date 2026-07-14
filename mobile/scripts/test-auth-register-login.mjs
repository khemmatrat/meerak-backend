/**
 * ทดสอบ register → login ทันที (จำลอง Android API path ไป api.aqond.com)
 * เขียนผลลง debug-990e30.log
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LOG_PATH = path.join(__dirname, '..', '..', 'debug-990e30.log');
const SESSION_ID = '990e30';
const API_BASE = (
  process.env.VITE_BACKEND_URL || 'https://api.aqond.com'
).replace(/\/$/, '');

function log(hypothesisId, location, message, data = {}) {
  const line = JSON.stringify({
    sessionId: SESSION_ID,
    runId: process.env.RUN_ID || 'auto-test',
    hypothesisId,
    location,
    message,
    data,
    timestamp: Date.now(),
  });
  fs.appendFileSync(LOG_PATH, line + '\n', 'utf8');
  console.log(`[${hypothesisId}] ${message}`, data);
}

function normalizePhoneForApi(phone) {
  let p = String(phone || '')
    .trim()
    .replace(/[\s\-()]/g, '')
    .replace(/^\+/, '');
  if (p.startsWith('66') && p.length >= 10) return '0' + p.slice(2);
  if (p.startsWith('0') && p.length === 10) return p;
  if (p.length === 9 && !p.startsWith('0')) return '0' + p;
  return p;
}

async function postJson(urlPath, body, headers = {}) {
  const res = await fetch(`${API_BASE}/api${urlPath}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = { raw: text.slice(0, 200) };
  }
  return { status: res.status, json };
}

async function getJson(urlPath) {
  const res = await fetch(`${API_BASE}/api${urlPath}`);
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json };
}

async function main() {
  const suffix = String(Date.now()).slice(-7);
  const phone = `09${suffix}`.slice(0, 10);
  const password = 'TestAuth990e30!';
  const firebaseUid = `debug-990e30-${suffix}`;
  const name = 'Debug Auth Test';

  log('H0', 'test-auth:main', 'test_start', {
    apiBase: API_BASE,
    phoneLast4: phone.slice(-4),
  });

  // --- Register ---
  const reg = await postJson('/auth/register', {
    phone,
    password,
    name,
    firebase_uid: firebaseUid,
    role: 'user',
  });
  log('H2', 'test-auth:register', 'register_response', {
    status: reg.status,
    success: !!reg.json?.success,
    hasToken: !!reg.json?.token,
    hasUserId: !!reg.json?.user?.id,
    error: reg.json?.error,
  });

  if (reg.status !== 200 || !reg.json?.token) {
    log('H2', 'test-auth:register', 'FAIL_register', { status: reg.status });
    process.exit(1);
  }

  const storedPhone = reg.json.user?.phone || phone;

  // --- Login immediately (same credentials) ---
  const loginVariants = [
    { label: 'same_0prefix', phone: storedPhone },
    { label: 'plus66', phone: '+66' + storedPhone.slice(1) },
    { label: '66prefix', phone: '66' + storedPhone.slice(1) },
  ];

  for (const variant of loginVariants) {
    const login = await postJson('/auth/login', {
      phone: variant.phone,
      password,
    });
    log('H1', 'test-auth:login', 'login_after_register', {
      variant: variant.label,
      inputPhoneLast4: String(variant.phone).slice(-4),
      status: login.status,
      code: login.json?.code,
      hasToken: !!login.json?.token,
      userId: login.json?.user?.id ? 'yes' : 'no',
    });
    log('H3', 'test-auth:login', 'phone_normalize_variant', {
      variant: variant.label,
      normalized: normalizePhoneForApi(variant.phone),
      ok: login.status === 200 && !!login.json?.token,
    });
  }

  // --- Profile check ---
  const profile = await getJson(
    `/users/profile/${encodeURIComponent(storedPhone)}`,
  );
  log('H2', 'test-auth:profile', 'profile_after_register', {
    status: profile.status,
    hasId: !!profile.json?.id,
  });

  log('H0', 'test-auth:main', 'test_complete', { pass: true });
}

main().catch((e) => {
  log('H5', 'test-auth:main', 'test_crash', { error: String(e?.message || e) });
  process.exit(1);
});
