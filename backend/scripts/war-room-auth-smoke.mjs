#!/usr/bin/env node
/**
 * WAR-P0-02 — Auth smoke probes (staging/production/local).
 * Usage: node scripts/war-room-auth-smoke.mjs [baseUrl]
 * Default baseUrl: http://127.0.0.1:3001
 */
const base = (process.argv[2] || process.env.WAR_ROOM_API_BASE || 'http://127.0.0.1:3001').replace(/\/$/, '');

async function req(method, path, body) {
  const t0 = Date.now();
  const init = { method, headers: { Accept: 'application/json' } };
  if (body !== undefined) {
    init.headers['Content-Type'] = 'application/json';
    init.body = JSON.stringify(body);
  }
  let res;
  let text = '';
  try {
    res = await fetch(`${base}${path}`, init);
    text = await res.text();
  } catch (e) {
    return { path, method, error: String(e.message || e), ms: Date.now() - t0 };
  }
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    json = null;
  }
  return {
    path,
    method,
    status: res.status,
    ms: Date.now() - t0,
    body: json ?? text.slice(0, 200),
  };
}

const cases = [
  ['GET', '/api/health', undefined],
  ['GET', '/api/meta', undefined],
  ['GET', '/api/app/bootstrap', undefined],
  ['POST', '/api/auth/login', { phone: '', password: '' }],
  ['POST', '/api/auth/register', {}],
  ['POST', '/api/auth/forgot-password', {}],
  ['POST', '/api/auth/phone-otp/send', {}],
  ['POST', '/api/auth/phone-otp/verify', {}],
  ['GET', '/api/videos/my', undefined],
];

const results = [];
for (const [method, path, body] of cases) {
  results.push(await req(method, path, body));
}

async function reqAuth(method, path, token) {
  const t0 = Date.now();
  const init = {
    method,
    headers: { Accept: 'application/json', Authorization: `Bearer ${token}` },
  };
  let res;
  let text = '';
  try {
    res = await fetch(`${base}${path}`, init);
    text = await res.text();
  } catch (e) {
    return { path, method, error: String(e.message || e), ms: Date.now() - t0, tag: 'invalid-jwt' };
  }
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    json = null;
  }
  return {
    path,
    method,
    status: res.status,
    ms: Date.now() - t0,
    tag: 'invalid-jwt',
    body: json ?? text.slice(0, 120),
  };
}

results.push(await reqAuth('GET', '/api/videos/my', 'not.a.valid.jwt'));

const protectedNoAuth = results.find((r) => r.path === '/api/videos/my' && !r.tag);
const invalidJwt = results.find((r) => r.tag === 'invalid-jwt');
const expect401 = protectedNoAuth?.status === 401;
const expect401Invalid = invalidJwt?.status === 401;

const report = {
  base,
  at: new Date().toISOString(),
  expect401Protected: expect401,
  expect401InvalidJwt: expect401Invalid,
  results,
};

console.log(JSON.stringify(report, null, 2));

const hardFail = results.filter((r) => {
  if (r.tag) return false;
  if (r.error) return true;
  if (r.path === '/api/health' && r.status !== 200) return true;
  if (r.path === '/api/meta' && r.status !== 200) return true;
  if (r.path === '/api/app/bootstrap' && r.status !== 200) return true;
  if (r.path.includes('phone-otp') && r.status === 404) return true;
  return false;
});

const coreOk = !hardFail.some((r) => !r.tag);
process.exit(coreOk && expect401 && expect401Invalid ? 0 : 1);
