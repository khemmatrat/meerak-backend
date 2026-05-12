/**
 * Phase M0 smoke: GET /api/wallet/deposit/preview + POST /api/wallet/deposit/payso (no auth → 401)
 * Usage: cd backend && node scripts/smoke_wallet_deposit_m0.js
 * Optional: SMOKE_API_HOST (default 127.0.0.1), SMOKE_API_PORT (overrides — else loads PORT from backend/.env, else 3001)
 */
import http from 'http';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '..', '.env') });

const host = process.env.SMOKE_API_HOST || '127.0.0.1';
const port = Number(process.env.SMOKE_API_PORT || process.env.PORT || '3001');

function req(method, path, bodyObj) {
  return new Promise((resolve, reject) => {
    const body = bodyObj ? JSON.stringify(bodyObj) : null;
    const opts = {
      hostname: host,
      port,
      path,
      method,
      headers: body
        ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }
        : {},
    };
    const r = http.request(opts, (res) => {
      let b = '';
      res.on('data', (c) => { b += c; });
      res.on('end', () => resolve({ status: res.statusCode, body: b }));
    });
    r.on('error', reject);
    if (body) r.write(body);
    r.end();
  });
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

async function main() {
  console.log(`M0 smoke → http://${host}:${port}`);

  const prev = await req('GET', '/api/wallet/deposit/preview?amount=100&payment_method=promptpay');
  assert(prev.status === 200, `preview expected 200 got ${prev.status}: ${prev.body}`);
  const j = JSON.parse(prev.body);
  assert(j.gross_amount === 100, 'gross_amount');
  assert(typeof j.net_to_wallet === 'number', 'net_to_wallet');
  assert(typeof j.processing_fee === 'number', 'processing_fee');
  assert(typeof j.gateway_fee === 'number', 'gateway_fee');
  assert(j.payment_method === 'promptpay', 'payment_method');
  console.log('OK GET /api/wallet/deposit/preview', { processing_fee: j.processing_fee, net_to_wallet: j.net_to_wallet });

  const payso = await req('POST', '/api/wallet/deposit/payso', {
    amount: 100,
    payment_method: 'promptpay',
  });
  if (payso.status === 404) {
    console.error(
      'POST /api/wallet/deposit/payso → 404 (route missing on THIS process). Restart backend after M0 upgrade so server.js picks up app.post(.../payso).',
    );
    process.exit(1);
  }
  assert(payso.status === 401, `POST /payso without auth expected 401 got ${payso.status}: ${payso.body.slice(0, 200)}`);
  console.log('OK POST /api/wallet/deposit/payso (401 unauthenticated)');

  const legacy = await req('POST', '/api/wallet/deposit', {
    amount: 100,
    payment_method: 'promptpay',
  });
  assert(legacy.status === 401, `POST /deposit without auth expected 401 got ${legacy.status}`);
  console.log('OK POST /api/wallet/deposit (401 unauthenticated)');

  console.log('M0 smoke passed.');
}

main().catch((e) => {
  if (e && (e.code === 'ECONNREFUSED' || String(e.message || '').includes('ECONNREFUSED'))) {
    console.error(`M0 smoke FAILED: connect ECONNREFUSED ${host}:${port}`);
    console.error('  → Start the API first:  cd backend && node server.js');
    console.error(`  → Or match your port:  set SMOKE_API_PORT=<PORT> && node scripts/smoke_wallet_deposit_m0.js`);
    console.error(`  → Script uses SMOKE_API_PORT, else PORT from backend/.env, else 3001 (currently trying ${port}).`);
  } else {
    console.error('M0 smoke FAILED:', e.message);
  }
  process.exit(1);
});
