#!/usr/bin/env node
/** Sprint S18 — AI assist routes (rules-only, no FairPlay) */
const AI_BASE = process.env.AI_CORE_URL || 'http://127.0.0.1:8100';
const API_KEY = process.env.AI_CORE_API_KEY || '';

async function post(path, body) {
  const headers = { 'Content-Type': 'application/json' };
  if (API_KEY) headers['x-ai-core-api-key'] = API_KEY;
  const res = await fetch(`${AI_BASE}${path}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${path} ${res.status} ${JSON.stringify(data)}`);
  return data;
}

async function main() {
  const claim = await post('/v1/ai/assist/claim-classify', {
    title: 'อาหารไม่ครบ',
    description: 'ขาดน้ำจิ้ม',
  });
  if (!claim.suggestion?.category) throw new Error('claim classify missing category');

  const photo = await post('/v1/ai/assist/photo-classify', { hint: 'packing proof' });
  if (!Array.isArray(photo.tags)) throw new Error('photo tags missing');

  const dup = await post('/v1/ai/assist/duplicate-detect', {
    order_id: 'ord-1',
    category: 'missing_items',
  });
  if (dup.duplicate !== false) throw new Error('duplicate detect wrong');

  const summary = await post('/v1/ai/assist/incident-summary', {
    transcript: 'rider late 30 min customer angry',
  });
  if (!summary.summary) throw new Error('incident summary missing');

  console.log('ai-assist.test.mjs OK');
}

main().catch((e) => {
  console.error('ai-assist FAILED:', e.message);
  process.exit(1);
});
