import crypto from 'crypto';

export function readIdempotencyKey(req) {
  const raw =
    (typeof req.headers['idempotency-key'] === 'string' && req.headers['idempotency-key'].trim()) ||
    (typeof req.headers['x-idempotency-key'] === 'string' && req.headers['x-idempotency-key'].trim()) ||
    '';
  return raw.slice(0, 160) || null;
}

export function hashPurchaseRequest(body = {}) {
  const payload = JSON.stringify({
    paymentMode: body.paymentMode || 'wallet',
    recipientUserId: body.recipientUserId || null,
    giftMessage: body.giftMessage || null,
    installmentCount: body.installmentCount || null,
  });
  return crypto.createHash('sha256').update(payload).digest('hex');
}

export async function loadIdempotentPurchaseResponse(client, { idempotencyKey, buyerId, courseId, requestHash }) {
  if (!idempotencyKey) return null;
  const r = await client.query(
    `SELECT response_json, request_hash
     FROM course_purchase_idempotency
     WHERE idempotency_key = $1 AND expires_at > NOW()
     LIMIT 1`,
    [idempotencyKey],
  );
  const row = r.rows?.[0];
  if (!row) return null;
  if (row.request_hash && requestHash && row.request_hash !== requestHash) {
    return { conflict: true };
  }
  return { response: row.response_json };
}

export async function storeIdempotentPurchaseResponse(client, {
  idempotencyKey,
  buyerId,
  courseId,
  requestHash,
  response,
}) {
  if (!idempotencyKey) return;
  await client.query(
    `INSERT INTO course_purchase_idempotency
       (idempotency_key, buyer_id, course_id, request_hash, response_json, expires_at)
     VALUES ($1, $2::uuid, $3, $4, $5::jsonb, NOW() + INTERVAL '7 days')
     ON CONFLICT (idempotency_key) DO UPDATE SET
       response_json = EXCLUDED.response_json,
       request_hash = EXCLUDED.request_hash,
       expires_at = EXCLUDED.expires_at`,
    [idempotencyKey, buyerId, courseId, requestHash || '', JSON.stringify(response)],
  );
}
