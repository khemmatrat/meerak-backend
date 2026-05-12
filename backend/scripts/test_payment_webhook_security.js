/**
 * Task 3 — paymentWebhookSecurity.js unit checks (no DB).
 *
 *   cd backend && node scripts/test_payment_webhook_security.js
 */

import crypto from 'crypto';
import assert from 'assert';
import {
  verifyPaymentWebhookSignature,
  createPaymentWebhookSignatureVerifierCallback,
  extractRawBodyAndHeadersFromJob,
} from '../lib/paymentWebhookSecurity.js';

function assertEq(a, b, msg) {
  if (a !== b) {
    console.error(msg, { a, b });
    process.exit(1);
  }
}

function hmacHex(secret, buf) {
  return crypto.createHmac('sha256', secret).update(buf).digest('hex');
}

const saved = {
  NODE_ENV: process.env.NODE_ENV,
  PAYMENT_WEBHOOK_SECRET: process.env.PAYMENT_WEBHOOK_SECRET,
  PAYMENT_GATEWAY_WEBHOOK_SECRET: process.env.PAYMENT_GATEWAY_WEBHOOK_SECRET,
  PAYMENT_WEBHOOK_SECRET_NEXT: process.env.PAYMENT_WEBHOOK_SECRET_NEXT,
  PAYMENT_GATEWAY_WEBHOOK_SECRET_NEXT: process.env.PAYMENT_GATEWAY_WEBHOOK_SECRET_NEXT,
  PAYMENT_WEBHOOK_STRICT: process.env.PAYMENT_WEBHOOK_STRICT,
  PAYMENT_GATEWAY_WEBHOOK_SIGNATURE_HEADER: process.env.PAYMENT_GATEWAY_WEBHOOK_SIGNATURE_HEADER,
};

function restoreEnv() {
  for (const [k, v] of Object.entries(saved)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
}

try {
  // --- a) active key good ---
  delete process.env.PAYMENT_WEBHOOK_SECRET_NEXT;
  delete process.env.PAYMENT_GATEWAY_WEBHOOK_SECRET_NEXT;
  delete process.env.PAYMENT_GATEWAY_WEBHOOK_SECRET;
  process.env.PAYMENT_WEBHOOK_SECRET = 'active-only-secret';
  process.env.NODE_ENV = 'test';
  const bodyA = Buffer.from('{"ok":true}', 'utf8');
  const hexA = hmacHex('active-only-secret', bodyA);
  const rA = verifyPaymentWebhookSignature({
    rawBody: bodyA,
    headers: { 'x-webhook-signature': hexA },
    provider: 'payso',
  });
  assertEq(rA.ok, true, 'a: ok');
  assertEq(rA.key_version, 'active', 'a: key_version');
  assertEq(rA.retryable, false, 'a: retryable');

  // --- b) active bad, next good ---
  process.env.PAYMENT_WEBHOOK_SECRET = 'wrong-active';
  process.env.PAYMENT_WEBHOOK_SECRET_NEXT = 'good-next';
  const bodyB = Buffer.from('payload-b', 'utf8');
  const hexB = hmacHex('good-next', bodyB);
  const rB = verifyPaymentWebhookSignature({
    rawBody: bodyB,
    headers: { 'x-payment-signature': hexB },
    provider: 'ksher',
  });
  assertEq(rB.ok, true, 'b: ok');
  assertEq(rB.key_version, 'next', 'b: key_version');
  assertEq(rB.retryable, false, 'b: retryable');

  // --- c) both bad ---
  process.env.PAYMENT_WEBHOOK_SECRET = 'bad1';
  process.env.PAYMENT_WEBHOOK_SECRET_NEXT = 'bad2';
  const bodyC = Buffer.from('payload-c', 'utf8');
  const hexC = hmacHex('good-next', bodyC);
  const rC = verifyPaymentWebhookSignature({
    rawBody: bodyC,
    headers: { 'x-webhook-signature': hexC },
    provider: 'payso',
  });
  assertEq(rC.ok, false, 'c: ok');
  assertEq(rC.failure_code, 'SIGNATURE_VERIFICATION_FAILED', 'c: failure_code');
  assertEq(rC.retryable, false, 'c: retryable');

  // --- d) malformed signature (not 64 hex) ---
  process.env.PAYMENT_WEBHOOK_SECRET = 's';
  delete process.env.PAYMENT_WEBHOOK_SECRET_NEXT;
  delete process.env.PAYMENT_GATEWAY_WEBHOOK_SECRET_NEXT;
  const rD = verifyPaymentWebhookSignature({
    rawBody: bodyA,
    headers: { 'x-webhook-signature': 'not-valid-hex!!!' },
    provider: 'payso',
  });
  assertEq(rD.ok, false, 'd: ok');
  assertEq(rD.failure_code, 'SIGNATURE_VERIFICATION_FAILED', 'd: failure_code');

  // --- e) production + secret + missing signature header ---
  process.env.NODE_ENV = 'production';
  process.env.PAYMENT_WEBHOOK_SECRET = 'prod-secret';
  delete process.env.PAYMENT_WEBHOOK_SECRET_NEXT;
  delete process.env.PAYMENT_GATEWAY_WEBHOOK_SECRET;
  delete process.env.PAYMENT_GATEWAY_WEBHOOK_SECRET_NEXT;
  const rE = verifyPaymentWebhookSignature({
    rawBody: bodyA,
    headers: {},
    provider: 'payso',
  });
  assertEq(rE.ok, false, 'e: ok');
  assertEq(rE.failure_code, 'INVALID_SIGNATURE', 'e: failure_code');

  // --- job callback wiring ---
  process.env.NODE_ENV = 'test';
  process.env.PAYMENT_WEBHOOK_SECRET = 'job-secret';
  const rawJson = '{"x":1}';
  const jobBuf = Buffer.from(rawJson, 'utf8');
  const sigHex = hmacHex('job-secret', jobBuf);
  const job = {
    provider: 'payso',
    payload_json: {
      raw_body: rawJson,
      headers: { 'x-webhook-signature': sigHex },
    },
    headers_json: { 'x-webhook-signature': sigHex },
  };
  const cb = createPaymentWebhookSignatureVerifierCallback();
  const rJ = await cb({ job, normalized: {} });
  assertEq(rJ.ok, true, 'job: ok');
  assertEq(rJ.key_version, 'active', 'job: key_version');
  assertEq(rJ.retryable, false, 'job: retryable');

  const ex = extractRawBodyAndHeadersFromJob(job);
  assert(Buffer.isBuffer(ex.rawBuf), 'extract rawBuf');
  assertEq(ex.headers['x-webhook-signature'], sigHex, 'extract header');

  // --- custom header name (parity with server.js PAYMENT_GATEWAY_WEBHOOK_SIGNATURE_HEADER) ---
  process.env.PAYMENT_GATEWAY_WEBHOOK_SIGNATURE_HEADER = 'X-Custom-Sig';
  process.env.PAYMENT_WEBHOOK_SECRET = 'custom-hdr-secret';
  const bodyH = Buffer.from('{"h":1}', 'utf8');
  const hexH = hmacHex('custom-hdr-secret', bodyH);
  const rH = verifyPaymentWebhookSignature({
    rawBody: bodyH,
    headers: { 'x-custom-sig': hexH },
    provider: 'payso',
  });
  assertEq(rH.ok, true, 'custom header: ok');
  assertEq(rH.key_version, 'active', 'custom header: key_version');
  delete process.env.PAYMENT_GATEWAY_WEBHOOK_SIGNATURE_HEADER;

  console.log('OK: test_payment_webhook_security.js — all checks passed');
} finally {
  restoreEnv();
}
