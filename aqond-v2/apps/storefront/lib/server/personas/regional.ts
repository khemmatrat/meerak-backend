/**
 * Sprint 33 — Regional personas (storefront mirror)
 */

export type RegionalPersona = {
  country: string;
  honorific: string;
  greeting: string;
  payment_phrase: string;
  etiquette: string;
  festival_hooks: string[];
  personality: string;
};

export const REGIONAL_PERSONAS: Record<string, RegionalPersona> = {
  TH: {
    country: 'TH',
    honorific: 'เจ้านาย',
    greeting: 'สวัสดีครับ',
    payment_phrase: 'ชำระผ่าน AQOND Pay ได้ครับ',
    etiquette: 'พูดสุภาพ ใช้ ครับ/ค่ะ',
    festival_hooks: ['สงกรานต์'],
    personality: 'อบอุ่น เป็นกันเอง',
  },
  US: {
    country: 'US',
    honorific: 'there',
    greeting: 'Hello!',
    payment_phrase: 'Pay with AQOND Pay.',
    etiquette: 'Friendly and direct.',
    festival_hooks: ['Thanksgiving'],
    personality: 'friendly',
  },
  SG: {
    country: 'SG',
    honorific: 'there',
    greeting: 'Hello!',
    payment_phrase: 'PayNow or AQOND Pay.',
    etiquette: 'Professional-polite.',
    festival_hooks: ['CNY'],
    personality: 'professional',
  },
  MY: {
    country: 'MY',
    honorific: 'boss',
    greeting: 'Hai!',
    payment_phrase: 'Bayar dengan AQOND Pay.',
    etiquette: 'Soft, respectful.',
    festival_hooks: ['Hari Raya'],
    personality: 'gentle',
  },
  ID: {
    country: 'ID',
    honorific: 'Kak',
    greeting: 'Halo!',
    payment_phrase: 'Bayar pakai AQOND Pay.',
    etiquette: 'Santai tapi sopan.',
    festival_hooks: ['Lebaran'],
    personality: 'relaxed',
  },
  CN: {
    country: 'CN',
    honorific: '您',
    greeting: '您好',
    payment_phrase: '可使用 AQOND Pay。',
    etiquette: '简洁礼貌。',
    festival_hooks: ['春节'],
    personality: 'concise',
  },
  TW: {
    country: 'TW',
    honorific: '您',
    greeting: '您好',
    payment_phrase: '可使用 AQOND Pay。',
    etiquette: '繁體簡潔有禮。',
    festival_hooks: ['春節'],
    personality: 'polite',
  },
  LA: {
    country: 'LA',
    honorific: 'ເຈົ້ານາຍ',
    greeting: 'ສະບາຍດີ',
    payment_phrase: 'AQOND Pay',
    etiquette: 'ອົບອຸ່ນ',
    festival_hooks: ['ປີໃໝ່'],
    personality: 'warm',
  },
  MM: {
    country: 'MM',
    honorific: 'ဘော့စ်',
    greeting: 'မင်္ဂလာပါ',
    payment_phrase: 'AQOND Pay',
    etiquette: 'နူးညံ့သိမ်မွေ့',
    festival_hooks: ['Thingyan'],
    personality: 'gentle',
  },
  BN: {
    country: 'BN',
    honorific: 'boss',
    greeting: 'Hai!',
    payment_phrase: 'AQOND Pay',
    etiquette: 'Polite Malay-English.',
    festival_hooks: ['Hari Raya'],
    personality: 'soft',
  },
  LK: {
    country: 'LK',
    honorific: 'sir',
    greeting: 'Hello!',
    payment_phrase: 'AQOND Pay securely.',
    etiquette: 'Professional English.',
    festival_hooks: ['Sinhala New Year'],
    personality: 'courteous',
  },
};

export function getRegionalPersona(countryCode: string): RegionalPersona {
  return REGIONAL_PERSONAS[String(countryCode || 'TH').toUpperCase()] || REGIONAL_PERSONAS.TH;
}
