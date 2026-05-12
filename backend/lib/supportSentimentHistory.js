/**
 * Global Sentiment Trend — สะสมค่า sentiment รายชั่วโมง (in-memory + อ้างอิงจากตั๋วล่าสุด)
 */

const MAX_HOURS_RETAIN = 48;
const buckets = new Map();

function hourKey(d) {
  const x = new Date(d);
  x.setMinutes(0, 0, 0);
  x.setSeconds(0, 0);
  return x.toISOString();
}

export function recordSentimentSample(score, at = Date.now()) {
  const s = Number(score);
  if (Number.isNaN(s)) return;
  const key = hourKey(at);
  const b = buckets.get(key) || { sum: 0, count: 0 };
  b.sum += Math.max(0, Math.min(1, s));
  b.count += 1;
  buckets.set(key, b);
  pruneBuckets();
}

function pruneBuckets() {
  const cutoff = Date.now() - MAX_HOURS_RETAIN * 3600000;
  for (const k of [...buckets.keys()]) {
    if (new Date(k).getTime() < cutoff) buckets.delete(k);
  }
}

/** รวมจากตั๋วใน store สำหรับชั่วโมงที่ยังไม่มีตัวอย่าง */
function mergeFromTickets(supportTicketsStore, hours) {
  const now = Date.now();
  const ticketPoints = new Map();
  for (let i = hours - 1; i >= 0; i--) {
    const d = new Date(now - i * 3600000);
    d.setMinutes(0, 0, 0);
    ticketPoints.set(d.toISOString(), { sum: 0, count: 0 });
  }
  for (const t of supportTicketsStore || []) {
    if (t.sentiment_score == null || Number.isNaN(Number(t.sentiment_score))) continue;
    const lu = new Date(t.lastUpdated || t.createdAt).getTime();
    if (lu < now - hours * 3600000) continue;
    const hk = hourKey(lu);
    if (!ticketPoints.has(hk)) continue;
    const b = ticketPoints.get(hk);
    b.sum += Number(t.sentiment_score);
    b.count += 1;
  }
  return ticketPoints;
}

export function getSentimentTrend(supportTicketsStore, hours = 24) {
  pruneBuckets();
  const now = Date.now();
  const fromTickets = mergeFromTickets(supportTicketsStore, hours);
  const points = [];
  for (let i = hours - 1; i >= 0; i--) {
    const d = new Date(now - i * 3600000);
    d.setMinutes(0, 0, 0);
    const key = d.toISOString();
    const mem = buckets.get(key);
    const tk = fromTickets.get(key);
    let avg = null;
    let count = 0;
    if (mem && mem.count > 0) {
      avg = mem.sum / mem.count;
      count = mem.count;
    } else if (tk && tk.count > 0) {
      avg = tk.sum / tk.count;
      count = tk.count;
    }
    points.push({
      hour: key,
      label: d.toLocaleString('th-TH', { month: 'short', day: 'numeric', hour: '2-digit' }),
      avgSentiment: avg,
      count,
    });
  }
  return { hours, points };
}
