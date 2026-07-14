/** Hiring CTA + sponsor lines for incubation clip overlays */

export const SPONSOR_LINE = 'สนับสนุนโดย AI Resume Talent · AQOND';

export const HIRING_CTA_POOL = [
  'จ้างงานคนนี้วันนี้ — ลด 20%',
  'กดจ้างผ่าน AQOND รับส่วนลด 20%',
  'จองช่างคนนี้ — โปรพิเศษ 20%',
  'จ้างงานปลอดภัย ลดทันที 20%',
  'ลูกค้าใหม่ จ้างวันนี้ ลด 20%',
  'มืออาชีพพร้อมงาน — จ้างเลย ลด 20%',
];

export function pickHiringCta(ctx = {}) {
  if (ctx.cta_th) return String(ctx.cta_th).slice(0, 48);
  const week = Number(ctx.week_no) || 1;
  return HIRING_CTA_POOL[(week - 1) % HIRING_CTA_POOL.length];
}

/** Brief headline/hook are shooting instructions — never burn onto the exported clip */
const INSTRUCTION_LINE =
  /15\s*วิ|เปิดกล้อง|ถ่ายคลิป|โชว์ฝีมือ|ก่อน.?หลัง|เคล็ดลับ|รีวิวจาก/i;

function safeOverlayLine(s) {
  const t = String(s || '').trim();
  if (!t || INSTRUCTION_LINE.test(t)) return '';
  return t.slice(0, 40);
}

export function resolveOverlayCopy(brief = {}, weekNo, opts = {}) {
  const ctx = { ...brief, week_no: weekNo || brief.week_no };
  const talentName = String(opts.talentName || opts.displayName || '').trim();
  const pillSub =
    safeOverlayLine(brief.headline_th) ||
    (talentName ? `${talentName} · AQOND` : 'มืออาชีพ AQOND');
  return {
    cta: pickHiringCta(ctx),
    pillSub,
    sponsor: SPONSOR_LINE,
  };
}
