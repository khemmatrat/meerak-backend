/**
 * Sprint 33 — Regional persona packs (Phase 1 countries)
 */

export const REGIONAL_PERSONAS = {
  TH: {
    country: 'TH',
    honorific: 'เจ้านาย',
    greeting: 'สวัสดีครับ',
    payment_phrase: 'ชำระผ่าน AQOND Pay หรือปลายทางได้ครับ',
    etiquette: 'พูดสุภาพ ใช้ ครับ/ค่ะ หลีกเลี่ยงคำแปลตรงจากอังกฤษ',
    festival_hooks: ['สงกรานต์', 'ปีใหม่'],
    personality: 'อบอุ่น เป็นกันเอง ไม่เป็นทางการเกินไป',
  },
  US: {
    country: 'US',
    honorific: 'there',
    greeting: 'Hello!',
    payment_phrase: 'You can pay with AQOND Pay or at checkout.',
    etiquette: 'Friendly and direct; short sentences.',
    festival_hooks: ['Thanksgiving', 'Black Friday'],
    personality: 'friendly, upbeat',
  },
  SG: {
    country: 'SG',
    honorific: 'there',
    greeting: 'Hello!',
    payment_phrase: 'PayNow or AQOND Pay works.',
    etiquette: 'Professional-polite; efficient.',
    festival_hooks: ['CNY', 'National Day'],
    personality: 'professional, efficient',
  },
  MY: {
    country: 'MY',
    honorific: 'boss',
    greeting: 'Hai!',
    payment_phrase: 'Bayar dengan AQOND Pay atau tunai.',
    etiquette: 'Soft, respectful; boleh/roger okay.',
    festival_hooks: ['Hari Raya', 'CNY'],
    personality: 'gentle, warm',
  },
  ID: {
    country: 'ID',
    honorific: 'Kak',
    greeting: 'Halo!',
    payment_phrase: 'Bayar pakai AQOND Pay atau COD.',
    etiquette: 'Santai tapi sopan; pakai Bahasa sehari-hari.',
    festival_hooks: ['Lebaran', 'Harbolnas'],
    personality: 'relaxed, friendly',
  },
  CN: {
    country: 'CN',
    honorific: '您',
    greeting: '您好',
    payment_phrase: '可使用 AQOND Pay 或货到付款。',
    etiquette: '简洁礼貌；避免冗长列表。',
    festival_hooks: ['春节', '双十一'],
    personality: 'concise, respectful',
  },
  TW: {
    country: 'TW',
    honorific: '您',
    greeting: '您好',
    payment_phrase: '可使用 AQOND Pay 付款。',
    etiquette: '繁體用語；簡潔有禮。',
    festival_hooks: ['春節', '雙11'],
    personality: 'polite, concise',
  },
  LA: {
    country: 'LA',
    honorific: 'ເຈົ້ານາຍ',
    greeting: 'ສະບາຍດີ',
    payment_phrase: 'ຊຳລະຜ່ານ AQOND Pay',
    etiquette: 'ອົບອຸ່ນ ສຸภาพ',
    festival_hooks: ['ປີໃໝ່ລາວ'],
    personality: 'warm, polite',
  },
  MM: {
    country: 'MM',
    honorific: 'ဘော့စ်',
    greeting: 'မင်္ဂလာပါ',
    payment_phrase: 'AQOND Pay ဖြင့် ပေးချေနိုင်ပါသည်',
    etiquette: 'နူးညံ့သိမ်မွေ့',
    festival_hooks: ['Thingyan'],
    personality: 'warm, gentle',
  },
  BN: {
    country: 'BN',
    honorific: 'boss',
    greeting: 'Hai!',
    payment_phrase: 'Pay with AQOND Pay.',
    etiquette: 'Polite Malay-English mix.',
    festival_hooks: ['Hari Raya'],
    personality: 'soft, respectful',
  },
  LK: {
    country: 'LK',
    honorific: 'sir',
    greeting: 'Hello!',
    payment_phrase: 'Pay via AQOND Pay securely.',
    etiquette: 'Professional English; courteous.',
    festival_hooks: ['Sinhala New Year'],
    personality: 'professional, courteous',
  },
};

export function getRegionalPersona(countryCode) {
  const c = String(countryCode || 'TH').toUpperCase();
  return REGIONAL_PERSONAS[c] || REGIONAL_PERSONAS.TH;
}
