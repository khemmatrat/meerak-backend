/**
 * Phase 4 — Reviews AI, social draft polish, server-side Pro quota sync.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { replyViaLocalOllama } from './osChatOllama.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.resolve(__dirname, '../.data');
const QUOTA_FILE = path.join(DATA_DIR, 'pro-quota.json');

function stripFences(text) {
  return String(text || '')
    .replace(/^```[\w]*\n?/i, '')
    .replace(/\n?```$/i, '')
    .trim();
}

async function withTimeout(promise, ms) {
  let timer;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error('pro_growth_timeout')), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function monthKey() {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

function ensureDataDir() {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  } catch {
    /* ignore */
  }
}

function loadQuotaStore() {
  try {
    if (!fs.existsSync(QUOTA_FILE)) return {};
    return JSON.parse(fs.readFileSync(QUOTA_FILE, 'utf8')) || {};
  } catch {
    return {};
  }
}

function saveQuotaStore(store) {
  try {
    ensureDataDir();
    fs.writeFileSync(QUOTA_FILE, JSON.stringify(store), 'utf8');
  } catch (e) {
    console.warn('[osProGrowth] quota save:', e?.message || e);
  }
}

/**
 * @returns {{ monthKey: string, descGen: number, video: number, social: number, reviews: number }}
 */
export function getProQuotaForUser(userKey) {
  const key = String(userKey || 'anon').slice(0, 120);
  const store = loadQuotaStore();
  const mk = monthKey();
  const cur = store[key];
  if (!cur || cur.monthKey !== mk) {
    return { monthKey: mk, descGen: 0, video: 0, social: 0, reviews: 0 };
  }
  return {
    monthKey: mk,
    descGen: Number(cur.descGen) || 0,
    video: Number(cur.video) || 0,
    social: Number(cur.social) || 0,
    reviews: Number(cur.reviews) || 0,
  };
}

/**
 * Merge client usage into server (take max per counter for current month).
 */
export function syncProQuotaForUser(userKey, usage = {}) {
  const key = String(userKey || 'anon').slice(0, 120);
  const store = loadQuotaStore();
  const mk = monthKey();
  const prev =
    store[key] && store[key].monthKey === mk
      ? store[key]
      : { monthKey: mk, descGen: 0, video: 0, social: 0, reviews: 0 };
  const next = {
    monthKey: mk,
    descGen: Math.max(Number(prev.descGen) || 0, Number(usage.descGen) || 0),
    video: Math.max(Number(prev.video) || 0, Number(usage.video) || 0),
    social: Math.max(Number(prev.social) || 0, Number(usage.social) || 0),
    reviews: Math.max(Number(prev.reviews) || 0, Number(usage.reviews) || 0),
    updatedAt: Date.now(),
  };
  store[key] = next;
  saveQuotaStore(store);
  return next;
}

export async function generateReviewReply({
  reviewBody = '',
  rating = 5,
  productName = '',
  language = 'th',
} = {}) {
  const body = String(reviewBody || '').trim();
  if (!body) {
    const err = new Error('review_required');
    err.status = 400;
    throw err;
  }
  const prompt = `You are an AQOND merchant writing a public review reply.
Language: ${language === 'en' ? 'English' : 'Thai'}.
Product: ${productName || 'product'}
Star rating: ${rating}
Customer review: "${body}"

Write ONE short gracious reply (max 55 words). No markdown.`;

  const ollamaMs = Number(process.env.OS_PRO_TOOLS_OLLAMA_MS || 8000);
  try {
    const local = await withTimeout(replyViaLocalOllama(prompt, []), ollamaMs);
    const text = stripFences(local?.message);
    if (text && text.length > 10) {
      return { reply: text, source: 'qwen_local' };
    }
  } catch (e) {
    console.warn('[osProGrowth] review ollama:', e?.message || e);
  }

  if (language === 'en') {
    return {
      reply:
        Number(rating) <= 2
          ? `Thank you for the honest feedback on ${productName || 'your order'}. We're following up to make this right.`
          : `Thank you for reviewing ${productName || 'us'}! We're glad it worked for you and hope to see you again.`,
      source: 'rules_fallback',
    };
  }
  return {
    reply:
      Number(rating) <= 2
        ? `ขอบคุณสำหรับรีวิว${productName ? `เรื่อง${productName}` : ''} ทางร้านรับไปปรับปรุงและจะติดต่อกลับเพื่อดูแลให้นะคะ`
        : `ขอบคุณมากสำหรับรีวิว${productName ? `ของ${productName}` : ''} ค่ะ ดีใจที่ถูกใจ ยินดีให้บริการอีกเสมอนะคะ`,
    source: 'rules_fallback',
  };
}

export async function polishSocialPost({
  productName = '',
  platform = 'facebook',
  language = 'th',
  highlights = '',
} = {}) {
  const name = String(productName || '').trim() || 'สินค้า';
  const prompt = `Write a short ${platform} caption for AQOND marketplace.
Language: ${language === 'en' ? 'English' : 'Thai'}.
Product: ${name}
Highlights: ${highlights || 'quality, shipping ready'}
Return ONLY the caption, under 60 words, 1 emoji max.`;

  const ollamaMs = Number(process.env.OS_PRO_TOOLS_OLLAMA_MS || 8000);
  try {
    const local = await withTimeout(replyViaLocalOllama(prompt, []), ollamaMs);
    const text = stripFences(local?.message);
    if (text && text.length > 12) {
      return { caption: text, source: 'qwen_local' };
    }
  } catch (e) {
    console.warn('[osProGrowth] social ollama:', e?.message || e);
  }

  if (language === 'en') {
    return {
      caption: `${name} is live on AQOND — ${highlights || 'ready to ship'}. Shop now.`,
      source: 'rules_fallback',
    };
  }
  return {
    caption: `${name} พร้อมจำหน่ายบน AQOND — ${highlights || 'คุณภาพดี ส่งไว'} สั่งได้เลยวันนี้`,
    source: 'rules_fallback',
  };
}
