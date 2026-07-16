/**
 * Rider OS E2E — bootstrap → รับงาน → ส่ง → หัก/คืนเครดิต → เติมวอลเล็ต → ขอถอน
 *
 * Prerequisites:
 *   - backend :3001, storefront :3003 with AQOND_LOCAL_DEV=1
 *   - JWT_SECRET set in backend/.env and storefront/.env.local
 *   - Face flow runs in dev-stub: set RIDER_FACE_MATCH_MODE=dev_stub and
 *     RIDER_FACE_DEV_STUB_ALWAYS_PASS=1 in backend/.env for a deterministic pass.
 *
 * Usage:
 *   node scripts/test-rider-os-e2e.mjs
 *   USER_ID=dc8bcd17-ac18-4dfa-a1b0-97c568ed7c21 node scripts/test-rider-os-e2e.mjs
 */
import pg from 'pg';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..', '..');

dotenv.config({ path: path.join(__dirname, '..', '.env') });
dotenv.config({ path: path.join(ROOT, 'aqond-v2', 'apps', 'storefront', '.env.local') });
dotenv.config({ path: path.join(ROOT, 'aqond-v2', 'apps', 'storefront', '.env') });

const BACKEND = (process.env.BACKEND_URL || 'http://127.0.0.1:3001').replace(/\/$/, '');
const STOREFRONT = (process.env.STOREFRONT_URL || 'http://127.0.0.1:3003').replace(/\/$/, '');
const USER_ID = process.env.USER_ID || 'dc8bcd17-ac18-4dfa-a1b0-97c568ed7c21';
const JWT_SECRET = process.env.JWT_SECRET || process.env.MEERAK_JWT_SECRET;
const TOPUP_THB = Number(process.env.TOPUP_THB || 10);
const TOPUP_MICRO = Math.round(TOPUP_THB * 100);
const JOB_AMOUNT_MICRO = Number(process.env.JOB_AMOUNT_MICRO || 25000);

const DISPATCH_JOBS_FILE = path.join(
  ROOT,
  'aqond-v2',
  'apps',
  'storefront',
  '.data',
  'dev',
  'dispatch-jobs.json',
);

const pool = new pg.Pool({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'meera',
  password: process.env.DB_PASSWORD,
  database: process.env.DB_DATABASE || 'meera_db',
  port: Number(process.env.DB_PORT || 5432),
});

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

async function json(url, init = {}) {
  const res = await fetch(url, init);
  const data = await res.json().catch(() => ({}));
  return { res, data };
}

function signToken(user) {
  assert(JWT_SECRET, 'JWT_SECRET missing — set in backend/.env and storefront/.env.local');
  return jwt.sign(
    { sub: String(user.id), role: user.role || 'USER', phone: user.phone },
    JWT_SECRET,
    { expiresIn: '1h' },
  );
}

function authHeaders(token, userId) {
  return {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
    'X-User-Id': String(userId),
  };
}

async function bootstrapRider(userId) {
  const riderId = `rider-test-${userId.slice(0, 8)}`;
  const mig = await fs.readFile(
    path.join(__dirname, '..', 'db', 'migrations', '262_rider_os_commerce_bootstrap.sql'),
    'utf8',
  );
  await pool.query(mig);

  const user = await pool.query(
    `SELECT id, email, phone, wallet_balance, role FROM users WHERE id = $1::uuid`,
    [userId],
  );
  assert(user.rows[0], `User not found: ${userId}`);

  await pool.query(
    `INSERT INTO commerce.dispatch_riders
      (id, display_name, phone, vehicle, plate, user_id, kyc_status, bank_account, active)
     VALUES ($1, $2, $3, 'motorcycle', 'E2E-1', $4, 'approved', '1234567890', TRUE)
     ON CONFLICT (id) DO UPDATE SET user_id = EXCLUDED.user_id, kyc_status = 'approved', active = TRUE`,
    [riderId, 'E2E Rider', user.rows[0].phone || '0812345678', userId],
  );

  await pool.query(
    `INSERT INTO commerce.rider_credit_accounts (rider_id, user_id, credit_limit_micro, credit_used_micro)
     VALUES ($1, $2, 50000, 0)
     ON CONFLICT (rider_id) DO UPDATE SET credit_used_micro = 0`,
    [riderId, userId],
  );

  if (Number(user.rows[0].wallet_balance || 0) < TOPUP_THB) {
    await pool.query(
      `UPDATE users SET wallet_balance = $1, wallet_balance_withdrawable = $1 WHERE id = $2::uuid`,
      [TOPUP_THB + 100, userId],
    );
  }

  // Seed a rider KYC portrait so face verify has an enrollment reference.
  // The rider marker (vehicles_json ILIKE '%rider_os%') is what getRiderKycPortrait matches.
  await pool.query(
    `INSERT INTO kyc_submissions (user_id, full_name, selfie_photo_url, address, vehicles_json, status, submitted_at, created_at)
     VALUES ($1::uuid, $2, $3, $4, $5::jsonb, 'approved', NOW(), NOW())
     ON CONFLICT DO NOTHING`,
    [
      userId,
      'E2E Rider',
      'https://cdn.example.com/e2e-portrait.jpg',
      'AQOND แอปไรเดอร์ E2E',
      JSON.stringify([{ type: 'motorcycle', source: 'rider_os' }]),
    ],
  ).catch(async (e) => {
    // Fall back to updating an existing rider submission if the insert conflicts on a schema constraint.
    await pool.query(
      `UPDATE kyc_submissions SET selfie_photo_url = $2, status = 'approved'
        WHERE user_id = $1::uuid AND vehicles_json::text ILIKE '%rider_os%'`,
      [userId, 'https://cdn.example.com/e2e-portrait.jpg'],
    ).catch(() => console.warn('   (portrait seed skipped:', e.message, ')'));
  });

  return { user: user.rows[0], riderId };
}

const DEVICE_FP = 'e2e-device-fp-0001';

function buildLiveness() {
  const t0 = Date.now() - 5000;
  const steps = ['center', 'turn_left', 'turn_right', 'blink'].map((id, i) => ({
    id,
    completed_at: new Date(t0 + i * 1200).toISOString(),
  }));
  return { steps, passed: true };
}

async function verifyFace(token, userId, riderId, purpose) {
  const { res, data } = await json(`${STOREFRONT}/api/rider/face/verify`, {
    method: 'POST',
    headers: authHeaders(token, userId),
    body: JSON.stringify({
      rider_id: riderId,
      purpose,
      selfie_base64: 'data:image/jpeg;base64,ZmFjZQ==',
      liveness: buildLiveness(),
      device_fingerprint: DEVICE_FP,
      lat: 13.724,
      lng: 100.534,
    }),
  });
  return { res, data };
}

async function checkFaceAction(token, userId, riderId, action, extra = {}) {
  const { res, data } = await json(`${BACKEND}/api/rider-os/face/check-action`, {
    method: 'POST',
    headers: authHeaders(token, userId),
    body: JSON.stringify({ rider_id: riderId, action, ...extra }),
  });
  return { res, data };
}

async function seedOpenJob(riderId) {
  const orderId = `e2e-order-${Date.now()}`;
  const jobId = `job-${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`;
  let store = { jobs: [] };
  try {
    store = JSON.parse(await fs.readFile(DISPATCH_JOBS_FILE, 'utf8'));
  } catch {
    /* new */
  }
  const job = {
    id: jobId,
    order_id: orderId,
    merchant_id: 'merchant-demo-1',
    buyer_id: 'buyer-e2e',
    status: 'open',
    phase: 'finding_rider',
    merchant_name: 'E2E ร้านทดสอบ',
    items_summary: 'ข้าวผัด x1',
    address: '123 ถ.ทดสอบ กรุงเทพ',
    amount_micro: JOB_AMOUNT_MICRO,
    payment_method: 'cod',
    job_type: 'food',
    pickup_lat: 13.724,
    pickup_lng: 100.534,
    dropoff_lat: 13.732,
    dropoff_lng: 100.541,
    updated_at: new Date().toISOString(),
  };
  store.jobs = [job, ...(store.jobs || []).filter((j) => j.id !== jobId)];
  await fs.mkdir(path.dirname(DISPATCH_JOBS_FILE), { recursive: true });
  await fs.writeFile(DISPATCH_JOBS_FILE, JSON.stringify(store, null, 2), 'utf8');
  return { jobId, orderId, job };
}

async function getCreditSummary(token, riderId, userId) {
  const { res, data } = await json(
    `${STOREFRONT}/api/rider/credits?rider_id=${encodeURIComponent(riderId)}&user_id=${encodeURIComponent(userId)}`,
    { headers: authHeaders(token, userId) },
  );
  assert(res.ok, `GET credits failed: ${res.status} ${JSON.stringify(data)}`);
  return data.summary || data;
}

async function advancePhases(token, userId, riderId, jobId) {
  const phases = ['rider_picked_up', 'en_route', 'arrived'];
  for (const phase of phases) {
    const { res, data } = await json(`${STOREFRONT}/api/rider/jobs/${jobId}/phase`, {
      method: 'POST',
      headers: authHeaders(token, userId),
      body: JSON.stringify({ phase, rider_id: riderId }),
    });
    assert(res.ok, `phase ${phase} failed: ${res.status} ${JSON.stringify(data)}`);
  }

  const photo = await json(`${STOREFRONT}/api/rider/jobs/${jobId}/phase`, {
    method: 'POST',
    headers: authHeaders(token, userId),
    body: JSON.stringify({
      phase: 'photo_proof',
      rider_id: riderId,
      photo_url: 'https://cdn.example.com/e2e-proof.jpg',
      lat: 13.732,
      lng: 100.541,
    }),
  });
  assert(photo.res.ok, `photo_proof failed: ${photo.res.status} ${JSON.stringify(photo.data)}`);

  for (const phase of ['handoff', 'rider_completed']) {
    const { res, data } = await json(`${STOREFRONT}/api/rider/jobs/${jobId}/phase`, {
      method: 'POST',
      headers: authHeaders(token, userId),
      body: JSON.stringify({ phase, rider_id: riderId }),
    });
    assert(res.ok, `phase ${phase} failed: ${res.status} ${JSON.stringify(data)}`);
  }
}

async function main() {
  console.log('=== Rider OS E2E ===');
  console.log({ BACKEND, STOREFRONT, USER_ID });

  const ready = await json(`${STOREFRONT}/api/rider/ready`);
  console.log('\n1) Readiness:', ready.res.status, ready.data);
  if (!ready.data?.ready) {
    console.warn('   (continuing — restart backend if /api/rider-os/ready returns 404)');
  }

  const { user, riderId } = await bootstrapRider(USER_ID);
  console.log('\n2) Bootstrap:', { riderId, email: user.email });

  const token = signToken(user);
  const before = await getCreditSummary(token, riderId, USER_ID);
  console.log('\n3) Credit before job:', {
    available: before.available_credit_micro,
    used: before.credit_used_micro,
  });

  const { jobId } = await seedOpenJob(riderId);
  console.log('\n4) Seeded open job:', jobId);

  // 4a) Face gate must BLOCK accept before any face session exists (negative proof).
  const gateBefore = await checkFaceAction(token, USER_ID, riderId, 'accept_job', {
    job_type: 'food',
    payment_method: 'cod',
    amount_micro: JOB_AMOUNT_MICRO,
  });
  assert(
    gateBefore.data?.ok === false,
    `expected face gate to block before verify, got: ${JSON.stringify(gateBefore.data)}`,
  );
  console.log('4a) Face gate blocks pre-verify:', gateBefore.data?.code || gateBefore.data?.needs_verify);

  // 4b) Daily clock-in (ตอกบัตรเช้า) — mints the session that unlocks accept.
  const daily = await verifyFace(token, USER_ID, riderId, 'daily');
  assert(daily.res.ok, `daily face verify failed: ${daily.res.status} ${JSON.stringify(daily.data)}`);
  const faceToken = daily.data?.session_token || daily.data?.token || null;
  console.log('4b) Daily face verify OK:', { level: daily.data?.verify_level, hasToken: !!faceToken });

  // 4c) Gate now passes for accept.
  const gateAfter = await checkFaceAction(token, USER_ID, riderId, 'accept_job', {
    face_session_token: faceToken,
    device_fingerprint: DEVICE_FP,
    lat: 13.724,
    lng: 100.534,
    job_type: 'food',
    payment_method: 'cod',
    amount_micro: JOB_AMOUNT_MICRO,
  });
  assert(gateAfter.data?.ok === true, `expected gate to pass after verify, got: ${JSON.stringify(gateAfter.data)}`);
  console.log('4c) Face gate passes post-verify');

  const accept = await json(`${STOREFRONT}/api/rider/jobs/${jobId}/accept`, {
    method: 'POST',
    headers: authHeaders(token, USER_ID),
    body: JSON.stringify({
      rider_id: riderId,
      face_session_token: faceToken,
      device_fingerprint: DEVICE_FP,
      lat: 13.724,
      lng: 100.534,
      job_type: 'food',
      payment_method: 'cod',
      amount_micro: JOB_AMOUNT_MICRO,
    }),
  });
  assert(accept.res.ok, `accept failed: ${accept.res.status} ${JSON.stringify(accept.data)}`);
  console.log('5) Accepted job — phase:', accept.data?.job?.phase);

  const afterAccept = await getCreditSummary(token, riderId, USER_ID);
  assert(
    Number(afterAccept.credit_used_micro || 0) > Number(before.credit_used_micro || 0),
    'credit_used should increase after accept',
  );
  console.log('6) Credit consumed:', {
    used: afterAccept.credit_used_micro,
    available: afterAccept.available_credit_micro,
  });

  await advancePhases(token, USER_ID, riderId, jobId);
  const afterDelivery = await getCreditSummary(token, riderId, USER_ID);
  console.log('\n7) After delivery:', {
    used: afterDelivery.credit_used_micro,
    cash: afterDelivery.cash_balance_micro,
    withdrawable: afterDelivery.withdrawable_micro,
  });

  const walletBefore = await pool.query(
    `SELECT wallet_balance FROM users WHERE id = $1::uuid`,
    [USER_ID],
  );
  const wb0 = Number(walletBefore.rows[0]?.wallet_balance || 0);

  const idem = `e2e-topup-${Date.now()}`;
  const topup = await json(`${BACKEND}/api/rider-os/credits/topup/wallet`, {
    method: 'POST',
    headers: authHeaders(token, USER_ID),
    body: JSON.stringify({ amount_micro: TOPUP_MICRO, idempotency_key: idem }),
  });
  assert(topup.res.ok, `wallet topup failed: ${topup.res.status} ${JSON.stringify(topup.data)}`);
  console.log('\n8) Wallet topup OK:', TOPUP_THB, 'THB');

  const walletAfter = await pool.query(
    `SELECT wallet_balance FROM users WHERE id = $1::uuid`,
    [USER_ID],
  );
  const wb1 = Number(walletAfter.rows[0]?.wallet_balance || 0);
  assert(Math.abs(wb1 - (wb0 - TOPUP_THB)) < 0.02, `wallet delta wrong: ${wb0} -> ${wb1}`);

  const withdrawIdem = `e2e-withdraw-${Date.now()}`;
  const withdraw = await json(`${STOREFRONT}/api/rider/withdraw`, {
    method: 'POST',
    headers: authHeaders(token, USER_ID),
    body: JSON.stringify({
      rider_id: riderId,
      amount_micro: Math.min(500, Number(afterDelivery.withdrawable_micro || 0)),
      idempotency_key: withdrawIdem,
      bank_account: '1234567890',
    }),
  });
  assert(withdraw.res.ok, `withdraw failed: ${withdraw.res.status} ${JSON.stringify(withdraw.data)}`);
  console.log('\n9) Withdraw request OK:', withdraw.data?.payout_id || withdraw.data?.status);

  console.log('\n✅ Rider OS E2E passed');
  await pool.end();
}

main().catch(async (e) => {
  console.error('\n❌ E2E failed:', e.message);
  await pool.end().catch(() => null);
  process.exit(1);
});
