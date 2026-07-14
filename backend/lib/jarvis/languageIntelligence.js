/**
 * Sprint 31 — Language Intelligence Layer (Layers 1 + 5)
 * Fast heuristic detection (~20ms). No user language picker.
 */

/** @typedef {'polite'|'casual'|'formal'|'urgent'} Formality */
/** @typedef {'warm'|'professional'|'concise'|'friendly'} ToneHint */

export const REGIONAL_MATRIX = {
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

const GREETING_HINTS = [
  { re: /สวัสดี|ครับ|ค่ะ|นะครับ/, country: 'TH', locale: 'th-TH', confidence: 0.92 },
  { re: /\bhello\b|\bhi\b|\bhey\b/i, country: 'US', locale: 'en-US', confidence: 0.85 },
  { re: /你好|您好/, country: 'CN', locale: 'zh-CN', confidence: 0.9 },
  { re: /apa khabar|selamat/i, country: 'MY', locale: 'ms-MY', confidence: 0.88 },
  { re: /\bhalo\b|\bada yang\b|\bbisa bantu/i, country: 'ID', locale: 'id-ID', confidence: 0.88 },
  { re: /မင်္ဂလာ/, country: 'MM', locale: 'my-MM', confidence: 0.9 },
  { re: /ສະບາຍດี/, country: 'LA', locale: 'lo-LA', confidence: 0.9 },
  { re: /வணக்கம்/, country: 'LK', locale: 'ta-LK', confidence: 0.88 },
];

function countryFromLocale(locale) {
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

function detectScriptLanguage(text) {
  const t = String(text || '').trim();
  if (!t) return null;
  if (MYANMAR_RE.test(t)) return { country: 'MM', locale: 'my-MM', confidence: 0.95, method: 'script' };
  if (LAO_RE.test(t) && !THAI_RE.test(t)) return { country: 'LA', locale: 'lo-LA', confidence: 0.9, method: 'script' };
  if (THAI_RE.test(t)) return { country: 'TH', locale: 'th-TH', confidence: 0.96, method: 'script' };
  if (TAMIL_RE.test(t)) return { country: 'LK', locale: 'ta-LK', confidence: 0.92, method: 'script' };
  if (CJK_RE.test(t)) {
    if (TRADITIONAL_HINTS.test(t)) {
      return { country: 'TW', locale: 'zh-TW', confidence: 0.88, method: 'script' };
    }
    return { country: 'CN', locale: 'zh-CN', confidence: 0.88, method: 'script' };
  }
  for (const hint of GREETING_HINTS) {
    if (hint.re.test(t)) {
      return { country: hint.country, locale: hint.locale, confidence: hint.confidence, method: 'greeting' };
    }
  }
  if (/\b(terima kasih|tolong|makan|restoran)\b/i.test(t)) {
    return { country: 'ID', locale: 'id-ID', confidence: 0.75, method: 'keyword' };
  }
  if (/\b(saya|boleh|restoran|makan)\b/i.test(t)) {
    return { country: 'MY', locale: 'ms-MY', confidence: 0.72, method: 'keyword' };
  }
  if (/[a-z]/i.test(t)) {
    return { country: 'US', locale: 'en-US', confidence: 0.7, method: 'latin' };
  }
  return null;
}

function parseAcceptLanguage(header) {
  const raw = String(header || '').split(',')[0]?.trim();
  if (!raw) return null;
  const locale = raw.split(';')[0].trim();
  return countryFromLocale(locale);
}

/**
 * Detect formality + emotion hints from message shape.
 * @returns {{ formality: Formality, tone: ToneHint, emotion: string }}
 */
export function detectToneAndEmotion(message, regional) {
  const m = String(message || '').trim();
  const len = m.length;
  let formality = regional?.defaultFormality || 'polite';
  let tone = regional?.defaultTone || 'warm';
  let emotion = 'neutral';

  if (/ช่วยด้วย|ด่วน|urgent|asap|!!!/i.test(m)) {
    emotion = 'stressed';
    formality = 'urgent';
    tone = 'concise';
  } else if (len <= 12 && !/[?？]/.test(m)) {
    emotion = 'hurried';
    tone = 'concise';
  } else if (/ครับ|ค่ะ|ขอบคุณ|please|thank you|terima kasih/i.test(m)) {
    formality = 'polite';
  } else if (/ขอรายละเอียด|please explain|detail/i.test(m)) {
    formality = 'formal';
    emotion = 'curious';
  }

  return { formality, tone, emotion };
}

/**
 * @param {{ message?: string, acceptLanguage?: string, storedProfile?: object, jarvisLocale?: string, countryHint?: string }} input
 */
export function detectLanguageIntelligence(input = {}) {
  const started = Date.now();
  const message = String(input.message || '');
  let hit = detectScriptLanguage(message);
  let method = hit?.method || 'default';

  if (!hit || (hit.confidence < 0.8 && input.jarvisLocale)) {
    const fromStored = countryFromLocale(input.jarvisLocale);
    if (!hit || hit.confidence < 0.75) {
      hit = {
        country: fromStored.country,
        locale: fromStored.locale,
        confidence: 0.65,
        method: 'stored_locale',
      };
      method = 'stored_locale';
    }
  }

  if (!hit && input.acceptLanguage) {
    const fromHeader = parseAcceptLanguage(input.acceptLanguage);
    hit = {
      country: fromHeader.country,
      locale: fromHeader.locale,
      confidence: 0.6,
      method: 'accept_language',
    };
    method = 'accept_language';
  }

  if (!hit && input.storedProfile?.detected_lang) {
    const fromProfile = countryFromLocale(input.storedProfile.detected_lang);
    hit = {
      country: fromProfile.country,
      locale: fromProfile.locale,
      confidence: 0.55,
      method: 'memory',
    };
    method = 'memory';
  }

  if (!hit) {
    hit = { country: 'TH', locale: 'th-TH', confidence: 0.5, method: 'default' };
    method = 'default';
  }

  if (input.countryHint && REGIONAL_MATRIX[input.countryHint]) {
    const forced = REGIONAL_MATRIX[input.countryHint];
    hit = { country: forced.country, locale: forced.locale, confidence: 0.99, method: 'country_hint' };
    method = 'country_hint';
  }

  const regional = REGIONAL_MATRIX[hit.country] || REGIONAL_MATRIX.TH;
  const { formality, tone, emotion } = detectToneAndEmotion(message, regional);

  const profile = {
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

  return profile;
}

export function isJarvisLangIntelEnabled() {
  return process.env.AIVOS_JARVIS_LANG_INTEL === '1';
}

export function enrichJarvisContext(ctx = {}) {
  if (!isJarvisLangIntelEnabled()) {
    return { ...ctx, language_intel_enabled: false };
  }
  const session = ctx.session || {};
  const existing = session.language_profile;
  const profile =
    existing && !ctx.user_message
      ? existing
      : detectLanguageIntelligence({
          message: ctx.user_message,
          acceptLanguage: ctx.accept_language,
          storedProfile: existing,
          jarvisLocale: session.jarvis_locale || ctx.jarvis_locale,
          countryHint: ctx.country_hint,
        });
  return {
    ...ctx,
    language_intel_enabled: true,
    language_profile: profile,
    session: { ...session, language_profile: profile },
  };
}
