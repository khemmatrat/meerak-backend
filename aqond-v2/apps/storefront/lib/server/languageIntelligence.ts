/**
 * Sprint 31 — Language Intelligence (storefront mirror of backend heuristics)
 */

export type LanguageProfile = {
  detected_lang: string;
  country: string;
  locale: string;
  script: string;
  currency: string;
  timezone: string;
  formality: string;
  tone: string;
  emotion: string;
  greeting: string;
  confidence: number;
  method: string;
  last_detected_at: string;
  detect_ms: number;
};

const REGIONAL_MATRIX: Record<
  string,
  {
    country: string;
    locale: string;
    currency: string;
    timezone: string;
    script: string;
    defaultFormality: string;
    defaultTone: string;
    greeting: string;
  }
> = {
  TH: {
    country: 'TH',
    locale: 'th-TH',
    currency: 'THB',
    timezone: 'Asia/Bangkok',
    script: 'thai',
    defaultFormality: 'polite',
    defaultTone: 'warm',
    greeting: 'สวัสดีครับ',
  },
  US: {
    country: 'US',
    locale: 'en-US',
    currency: 'USD',
    timezone: 'America/New_York',
    script: 'latin',
    defaultFormality: 'casual',
    defaultTone: 'friendly',
    greeting: 'Hello!',
  },
  CN: {
    country: 'CN',
    locale: 'zh-CN',
    currency: 'CNY',
    timezone: 'Asia/Shanghai',
    script: 'han-simplified',
    defaultFormality: 'formal',
    defaultTone: 'concise',
    greeting: '您好',
  },
  TW: {
    country: 'TW',
    locale: 'zh-TW',
    currency: 'TWD',
    timezone: 'Asia/Taipei',
    script: 'han-traditional',
    defaultFormality: 'formal',
    defaultTone: 'concise',
    greeting: '您好',
  },
  MY: {
    country: 'MY',
    locale: 'ms-MY',
    currency: 'MYR',
    timezone: 'Asia/Kuala_Lumpur',
    script: 'latin',
    defaultFormality: 'casual',
    defaultTone: 'friendly',
    greeting: 'Hai!',
  },
  ID: {
    country: 'ID',
    locale: 'id-ID',
    currency: 'IDR',
    timezone: 'Asia/Jakarta',
    script: 'latin',
    defaultFormality: 'casual',
    defaultTone: 'friendly',
    greeting: 'Halo!',
  },
  SG: {
    country: 'SG',
    locale: 'en-SG',
    currency: 'SGD',
    timezone: 'Asia/Singapore',
    script: 'latin',
    defaultFormality: 'formal',
    defaultTone: 'professional',
    greeting: 'Hello!',
  },
  LA: {
    country: 'LA',
    locale: 'lo-LA',
    currency: 'LAK',
    timezone: 'Asia/Vientiane',
    script: 'lao',
    defaultFormality: 'polite',
    defaultTone: 'warm',
    greeting: 'ສະບາຍດີ',
  },
  MM: {
    country: 'MM',
    locale: 'my-MM',
    currency: 'MMK',
    timezone: 'Asia/Yangon',
    script: 'myanmar',
    defaultFormality: 'polite',
    defaultTone: 'warm',
    greeting: 'မင်္ဂလာပါ',
  },
  BN: {
    country: 'BN',
    locale: 'ms-BN',
    currency: 'BND',
    timezone: 'Asia/Brunei',
    script: 'latin',
    defaultFormality: 'polite',
    defaultTone: 'warm',
    greeting: 'Hai!',
  },
  LK: {
    country: 'LK',
    locale: 'en-LK',
    currency: 'LKR',
    timezone: 'Asia/Colombo',
    script: 'latin',
    defaultFormality: 'formal',
    defaultTone: 'professional',
    greeting: 'Hello!',
  },
};

const THAI_RE = /[\u0E00-\u0E7F]/;
const LAO_RE = /[\u0E80-\u0EFF]/;
const MYANMAR_RE = /[\u1000-\u109F]/;
const TAMIL_RE = /[\u0B80-\u0BFF]/;
const CJK_RE = /[\u4E00-\u9FFF\u3400-\u4DBF]/;
const TRADITIONAL_HINTS = /[國臺灣說這裡麼為與]/;

function countryFromLocale(locale?: string) {
  const loc = String(locale || '').toLowerCase();
  for (const row of Object.values(REGIONAL_MATRIX)) {
    if (row.locale.toLowerCase() === loc) return row;
  }
  if (loc.startsWith('th')) return REGIONAL_MATRIX.TH;
  if (loc.startsWith('zh-tw') || loc.startsWith('zh-hant')) return REGIONAL_MATRIX.TW;
  if (loc.startsWith('zh')) return REGIONAL_MATRIX.CN;
  if (loc.startsWith('ms')) return REGIONAL_MATRIX.MY;
  if (loc.startsWith('id')) return REGIONAL_MATRIX.ID;
  if (loc.startsWith('lo')) return REGIONAL_MATRIX.LA;
  if (loc.startsWith('my')) return REGIONAL_MATRIX.MM;
  if (loc.startsWith('ta')) return REGIONAL_MATRIX.LK;
  if (loc.startsWith('en-sg')) return REGIONAL_MATRIX.SG;
  if (loc.startsWith('en')) return REGIONAL_MATRIX.US;
  return REGIONAL_MATRIX.TH;
}

function detectScriptLanguage(text: string) {
  if (!text.trim()) return null;
  if (MYANMAR_RE.test(text)) return { country: 'MM', locale: 'my-MM', confidence: 0.95, method: 'script' };
  if (LAO_RE.test(text) && !THAI_RE.test(text)) return { country: 'LA', locale: 'lo-LA', confidence: 0.9, method: 'script' };
  if (THAI_RE.test(text)) return { country: 'TH', locale: 'th-TH', confidence: 0.96, method: 'script' };
  if (TAMIL_RE.test(text)) return { country: 'LK', locale: 'ta-LK', confidence: 0.92, method: 'script' };
  if (CJK_RE.test(text)) {
    if (TRADITIONAL_HINTS.test(text)) return { country: 'TW', locale: 'zh-TW', confidence: 0.88, method: 'script' };
    return { country: 'CN', locale: 'zh-CN', confidence: 0.88, method: 'script' };
  }
  if (/สวัสดี|ครับ|ค่ะ/.test(text)) return { country: 'TH', locale: 'th-TH', confidence: 0.92, method: 'greeting' };
  if (/\bhello\b|\bhi\b/i.test(text)) return { country: 'US', locale: 'en-US', confidence: 0.85, method: 'greeting' };
  if (/你好|您好/.test(text)) return { country: 'CN', locale: 'zh-CN', confidence: 0.9, method: 'greeting' };
  if (/apa khabar|selamat/i.test(text)) return { country: 'MY', locale: 'ms-MY', confidence: 0.88, method: 'greeting' };
  if (/\bhalo\b|\bbisa bantu/i.test(text)) return { country: 'ID', locale: 'id-ID', confidence: 0.88, method: 'greeting' };
  if (/[a-z]/i.test(text)) return { country: 'US', locale: 'en-US', confidence: 0.7, method: 'latin' };
  return null;
}

function detectToneAndEmotion(message: string, regional: (typeof REGIONAL_MATRIX)[string]) {
  const len = message.trim().length;
  let formality = regional.defaultFormality;
  let tone = regional.defaultTone;
  let emotion = 'neutral';
  if (/ช่วยด้วย|ด่วน|urgent|asap|!!!/i.test(message)) {
    emotion = 'stressed';
    formality = 'urgent';
    tone = 'concise';
  } else if (len <= 12 && !/[?？]/.test(message)) {
    emotion = 'hurried';
    tone = 'concise';
  } else if (/ครับ|ค่ะ|please|thank you/i.test(message)) {
    formality = 'polite';
  }
  return { formality, tone, emotion };
}

export function isJarvisLangIntelEnabled(): boolean {
  return (
    process.env.JARVIS_LANG_INTEL === '1' ||
    process.env.NEXT_PUBLIC_JARVIS_LANG_INTEL === '1'
  );
}

export function detectLanguageIntelligence(input: {
  message?: string;
  acceptLanguage?: string | null;
  storedProfile?: Partial<LanguageProfile> | null;
  jarvisLocale?: string | null;
  countryHint?: string | null;
}): LanguageProfile {
  const started = Date.now();
  const message = String(input.message || '');
  let hit = detectScriptLanguage(message);
  let method = hit?.method || 'default';

  if (!hit && input.jarvisLocale) {
    const fromStored = countryFromLocale(input.jarvisLocale);
    hit = { country: fromStored.country, locale: fromStored.locale, confidence: 0.65, method: 'stored_locale' };
    method = 'stored_locale';
  }

  if (!hit && input.acceptLanguage) {
    const loc = input.acceptLanguage.split(',')[0]?.split(';')[0]?.trim();
    const fromHeader = countryFromLocale(loc);
    hit = { country: fromHeader.country, locale: fromHeader.locale, confidence: 0.6, method: 'accept_language' };
    method = 'accept_language';
  }

  if (!hit && input.storedProfile?.detected_lang) {
    const fromProfile = countryFromLocale(input.storedProfile.detected_lang);
    hit = { country: fromProfile.country, locale: fromProfile.locale, confidence: 0.55, method: 'memory' };
    method = 'memory';
  }

  if (!hit) {
    hit = { country: 'TH', locale: 'th-TH', confidence: 0.5, method: 'default' };
  }

  if (input.countryHint && REGIONAL_MATRIX[input.countryHint]) {
    const forced = REGIONAL_MATRIX[input.countryHint];
    hit = { country: forced.country, locale: forced.locale, confidence: 0.99, method: 'country_hint' };
    method = 'country_hint';
  }

  const regional = REGIONAL_MATRIX[hit.country] || REGIONAL_MATRIX.TH;
  const { formality, tone, emotion } = detectToneAndEmotion(message, regional);

  return {
    detected_lang: hit.locale,
    country: hit.country,
    locale: hit.locale,
    script: regional.script,
    currency: regional.currency,
    timezone: regional.timezone,
    formality,
    tone,
    emotion,
    greeting: regional.greeting,
    confidence: hit.confidence,
    method,
    last_detected_at: new Date().toISOString(),
    detect_ms: Date.now() - started,
  };
}
