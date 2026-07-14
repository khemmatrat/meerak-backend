/** โทเค็นวิดีโอโฆษณา — 1 คลิป = TOKENS_PER_VIDEO (หักเมื่อใช้โควต้าฟรีหมดแล้ว) */

export const TOKENS_PER_VIDEO = Number(process.env.AIVOS_MERCHANT_AD_TOKENS_PER_VIDEO || 100);

/** แพ็กเติมเงิน (บาท → โทเค็น) — ยิ่งซื้อมากยิ่งได้โบนัส */
export const AD_TOKEN_PACKAGES = [
  { id: 'p99', price_thb: 99, tokens: 100, badge: 'เริ่มต้น' },
  { id: 'p199', price_thb: 199, tokens: 220, badge: 'คุ้ม +10%' },
  { id: 'p399', price_thb: 399, tokens: 500, badge: 'ยอดนิยม +25%' },
  { id: 'p599', price_thb: 599, tokens: 800, badge: '+33%' },
  { id: 'p799', price_thb: 799, tokens: 1100, badge: '+38%' },
  { id: 'p999', price_thb: 999, tokens: 1500, badge: '+51%' },
  { id: 'p1299', price_thb: 1299, tokens: 2000, badge: 'สุดคุ้ม +54%' },
];

export const MIN_CUSTOM_TOPUP_THB = 99;

/** อัตราฐาน: 99 บาท = 100 โทเค็น */
export function tokensForCustomAmount(thb) {
  const amount = Math.floor(Number(thb) || 0);
  if (amount < MIN_CUSTOM_TOPUP_THB) return 0;
  return Math.floor((amount / 99) * 100);
}

export function videosFromTokens(tokens) {
  return Math.floor(tokens / TOKENS_PER_VIDEO);
}

export function tokenEconomicsSummary() {
  return {
    tokens_per_video: TOKENS_PER_VIDEO,
    free_weekly_clips: Number(process.env.AIVOS_MERCHANT_AD_WEEKLY_LIMIT || 3),
    cost_split: { platform_margin_pct: 80, api_system_pct: 20 },
    note_th:
      'โควต้าฟรี 3 คลิป/สัปดาห์ไม่หักโทเค็น เมื่อหมดใช้โทเค็นเติมเงิน (1 คลิป = 100 โทเค็น)',
    packages: AD_TOKEN_PACKAGES.map((p) => ({
      ...p,
      videos_approx: videosFromTokens(p.tokens),
      per_video_thb: Math.round(p.price_thb / videosFromTokens(p.tokens)),
    })),
    min_custom_thb: MIN_CUSTOM_TOPUP_THB,
  };
}
