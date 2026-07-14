/**
 * Sprint 35 — STT/TTS locale map (11 countries)
 */

export const VOICE_LOCALES = {
  TH: { country: 'TH', stt: 'th-TH', tts: 'th-TH', bcp47: 'th-TH', voice_hint: 'th', currency: 'THB' },
  US: { country: 'US', stt: 'en-US', tts: 'en-US', bcp47: 'en-US', voice_hint: 'en', currency: 'USD' },
  SG: { country: 'SG', stt: 'en-SG', tts: 'en-SG', bcp47: 'en-SG', voice_hint: 'en', currency: 'SGD' },
  MY: { country: 'MY', stt: 'ms-MY', tts: 'ms-MY', bcp47: 'ms-MY', voice_hint: 'ms', currency: 'MYR' },
  ID: { country: 'ID', stt: 'id-ID', tts: 'id-ID', bcp47: 'id-ID', voice_hint: 'id', currency: 'IDR' },
  CN: { country: 'CN', stt: 'zh-CN', tts: 'zh-CN', bcp47: 'zh-CN', voice_hint: 'zh', currency: 'CNY' },
  TW: { country: 'TW', stt: 'zh-TW', tts: 'zh-TW', bcp47: 'zh-TW', voice_hint: 'zh', currency: 'TWD' },
  LA: { country: 'LA', stt: 'lo-LA', tts: 'lo-LA', bcp47: 'lo-LA', voice_hint: 'lo', currency: 'LAK' },
  MM: { country: 'MM', stt: 'my-MM', tts: 'my-MM', bcp47: 'my-MM', voice_hint: 'my', currency: 'MMK' },
  BN: { country: 'BN', stt: 'ms-BN', tts: 'ms-BN', bcp47: 'ms-BN', voice_hint: 'ms', currency: 'BND' },
  LK: { country: 'LK', stt: 'en-LK', tts: 'en-LK', bcp47: 'en-LK', voice_hint: 'en', currency: 'LKR' },
};

export function resolveVoiceLocale(countryOrLocale = 'TH') {
  const key = String(countryOrLocale || 'TH').toUpperCase();
  if (VOICE_LOCALES[key]) return VOICE_LOCALES[key];
  const loc = String(countryOrLocale || '');
  const prefix = loc.split('-')[0]?.toLowerCase();
  if (prefix === 'th') return VOICE_LOCALES.TH;
  if (prefix === 'en') return VOICE_LOCALES.US;
  if (prefix === 'zh') return loc.includes('TW') ? VOICE_LOCALES.TW : VOICE_LOCALES.CN;
  if (prefix === 'ms') return VOICE_LOCALES.MY;
  if (prefix === 'id') return VOICE_LOCALES.ID;
  if (prefix === 'lo') return VOICE_LOCALES.LA;
  if (prefix === 'my') return VOICE_LOCALES.MM;
  return VOICE_LOCALES.TH;
}
