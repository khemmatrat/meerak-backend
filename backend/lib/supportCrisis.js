/**
 * Crisis Heatmap — ตรวจจับ "คลื่น" ข้อความซ้ำใน Support (in-memory; ใช้ร่วมกับ Redis ในอนาคต)
 */

const CRISIS_WINDOW_MS = parseInt(process.env.SUPPORT_CRISIS_WINDOW_MS || String(10 * 60 * 1000), 10);
const CRISIS_MIN_COUNT = parseInt(process.env.SUPPORT_CRISIS_THRESHOLD || '50', 10);

/** คีย์เวิร์ดที่มักบ่งชี้เหตุระดับระบบ (นับรวมกันได้) */
const CRISIS_PATTERN_BUCKETS = [
  { id: 'payment_fail', test: (s) => /จ่ายเงิน|โอน.*ไม่|payment.*fail|ชำระ.*ไม่|ไม่ผ่าน/i.test(s) },
  { id: 'error_5xx', test: (s) => /\b5\d{2}\b|server error|internal error|bad gateway|timeout/i.test(s) },
  { id: 'cannot_login', test: (s) => /เข้า.*ไม่ได้|ล็อกอิน|login.*fail|รหัส.*ผิด/i.test(s) },
  { id: 'app_crash', test: (s) => /แอป.*เด้ง|crash|force close|ปิดเอง/i.test(s) },
];

const fingerprints = [];

function normalizeMessageKey(msg) {
  return String(msg || '')
    .toLowerCase()
    .replace(/\d+/g, '#')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 96);
}

function prune(now) {
  const cutoff = now - CRISIS_WINDOW_MS;
  while (fingerprints.length && fingerprints[0].t < cutoff) {
    fingerprints.shift();
  }
}

/**
 * เรียกทุกครั้งที่มี USER message เข้า support (ข้อความจริง — ใช้เฉพาะสำหรับนับ)
 */
export function recordSupportUserMessage(messageText) {
  const now = Date.now();
  prune(now);
  const raw = String(messageText || '');
  const key = normalizeMessageKey(raw);
  if (key.length >= 6) {
    fingerprints.push({ t: now, kind: 'msg', key });
  }
  for (const b of CRISIS_PATTERN_BUCKETS) {
    try {
      if (b.test(raw)) {
        fingerprints.push({ t: now, kind: 'pat', key: b.id });
      }
    } catch (_) {}
  }
}

export function getCrisisStatus() {
  const now = Date.now();
  prune(now);
  const cutoff = now - CRISIS_WINDOW_MS;
  const counts = new Map();
  for (const f of fingerprints) {
    if (f.t < cutoff) continue;
    counts.set(f.key, (counts.get(f.key) || 0) + 1);
  }
  const incidents = [];
  for (const [key, count] of counts) {
    if (count >= CRISIS_MIN_COUNT) {
      incidents.push({
        signature: key,
        count,
        windowMinutes: Math.round(CRISIS_WINDOW_MS / 60000),
        threshold: CRISIS_MIN_COUNT,
      });
    }
  }
  incidents.sort((a, b) => b.count - a.count);
  const active = incidents.length > 0;
  return {
    active,
    windowMinutes: Math.round(CRISIS_WINDOW_MS / 60000),
    threshold: CRISIS_MIN_COUNT,
    incidents,
    detectedAt: active ? new Date(now).toISOString() : null,
  };
}
