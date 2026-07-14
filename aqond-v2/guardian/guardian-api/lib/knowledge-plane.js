/**
 * Phase 2 — Knowledge Plane v1 (curated read models only; no raw DB).
 */

const FAQ_TH = [
  { id: 'faq.shipping', q: 'ส่งของกี่วัน', a: 'มาตรฐาน 2–5 วันทำการ ขึ้นกับพื้นที่และร้านค้า' },
  { id: 'faq.refund', q: 'คืนเงิน', a: 'ขอคืนเงินผ่านศูนย์ช่วยเหลือ ภายใน 7 วันหลังได้รับสินค้า' },
  { id: 'faq.jarvis', q: 'jarvis คืออะไร', a: 'Jarvis เป็นผู้ช่วย AI สำหรับค้นหาและเปรียบเทียบสินค้าใน AQOND' },
];

const FAQ_EN = [
  { id: 'faq.shipping', q: 'shipping time', a: 'Standard delivery 2–5 business days depending on seller and region.' },
  { id: 'faq.refund', q: 'refund', a: 'Request a refund via Help Center within 7 days of delivery.' },
  { id: 'faq.jarvis', q: 'what is jarvis', a: 'Jarvis is the AQOND AI concierge for search and product comparison.' },
];

function score(query, text) {
  const q = String(query).toLowerCase();
  const t = String(text).toLowerCase();
  if (!q || !t) return 0;
  if (t.includes(q) || q.includes(t.slice(0, Math.min(8, t.length)))) return 1;
  const words = q.split(/\s+/).filter((w) => w.length > 2);
  if (!words.length) return 0;
  const hits = words.filter((w) => t.includes(w)).length;
  return hits / words.length;
}

export function queryKnowledge(input = {}) {
  const query = String(input.query || '').trim();
  const locale = String(input.locale || 'th').toLowerCase();
  const pool = locale.startsWith('en') ? FAQ_EN : FAQ_TH;

  const ranked = pool
    .map((row) => ({ ...row, score: Math.max(score(query, row.q), score(query, row.a) * 0.8) }))
    .filter((r) => r.score > 0.2)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);

  return {
    ok: true,
    plane: 'knowledge_v1',
    source: 'curated_faq',
    tenant_id: input.tenant_id || null,
    query,
    results: ranked,
    hit_count: ranked.length,
    raw_db: false,
  };
}
