/**
 * Pro toolkit AI helpers — product description (+ auto-reply suggest later).
 */
import { replyViaLocalOllama } from './osChatOllama.js';

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
        timer = setTimeout(() => reject(new Error('pro_tools_timeout')), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function ruleBasedProductDescription(productName, { tone = 'professional', language = 'th' } = {}) {
  const name = String(productName || '').trim() || 'สินค้า AQOND';
  if (language === 'en') {
    return [
      `${name} — Premium Marketplace Pick`,
      '',
      `Discover ${name}, curated for quality-conscious shoppers on AQOND.`,
      '• Carefully selected materials and finish',
      '• Ready for everyday use with lasting value',
      '• Ships via AQOND trusted merchants',
      '',
      'Add to cart today — limited curated stock.',
    ].join('\n');
  }
  const toneLine =
    tone === 'luxury'
      ? 'ดีไซน์พรีเมียม สัมผัสความหรูในทุกดีเทิล'
      : tone === 'friendly'
        ? 'ใช้งานง่าย คุ้มค่า เหมาะกับทุกวัน'
        : 'คุณภาพคัดสรร มาตรฐานร้านค้าบน AQOND';
  return [
    `✨ ${name}`,
    '',
    `${toneLine} — สินค้าพร้อมจำหน่ายผ่าน AQOND Marketplace`,
    '',
    'จุดเด่น',
    `• ${name} คัดคุณภาพ เหมาะกับลูกค้าที่มองหาของดีราคาสมเหตุสมผล`,
    '• รายละเอียดครบ ดูง่าย สั่งสะดวก',
    '• รองรับการจัดส่งผ่านระบบ AQOND',
    '',
    'กดเพิ่มรถเข็นได้เลยวันนี้ — จำนวนจำกัดตามสต็อกหน้าร้าน',
  ].join('\n');
}

/**
 * @returns {Promise<{ description: string, source: string, model?: string }>}
 */
export async function generateProductDescription({
  productName,
  features = '',
  tone = 'professional',
  language = 'th',
} = {}) {
  const name = String(productName || '').trim();
  if (!name) {
    const err = new Error('product_name_required');
    err.status = 400;
    throw err;
  }

  const langLabel = language === 'en' ? 'English' : 'Thai';
  const prompt = `You are an expert e-commerce copywriter for AQOND Marketplace.
Write a compelling product listing description in ${langLabel}.
Tone: ${tone}.
Product name: ${name}
Key features (optional): ${features || '(infer reasonable selling points without inventing fake certifications)'}

Rules:
- Return ONLY the description text (no markdown fences, no preamble).
- Include a short headline, 3-5 bullet benefits, and a soft CTA.
- Do not invent false medical/financial claims.
- Keep under 180 words.`;

  const ollamaMs = Number(process.env.OS_PRO_TOOLS_OLLAMA_MS || 8000);
  try {
    const local = await withTimeout(replyViaLocalOllama(prompt, []), ollamaMs);
    const text = stripFences(local?.message);
    if (text && text.length > 40) {
      return {
        description: text,
        source: 'qwen_local',
        model: local?.sources?.prose || 'ollama',
      };
    }
  } catch (e) {
    console.warn('[osProTools] ollama desc:', e?.message || e);
  }

  return {
    description: ruleBasedProductDescription(name, { tone, language }),
    source: 'rules_fallback',
  };
}

/**
 * Suggest merchant reply (Phase 1 will expand).
 */
export async function generateAutoReplySuggestion({
  customerMessage,
  productName = '',
  style = 'friendly',
  language = 'th',
} = {}) {
  const msg = String(customerMessage || '').trim();
  if (!msg) {
    const err = new Error('customer_message_required');
    err.status = 400;
    throw err;
  }

  const prompt = `You are an AQOND merchant assistant.
Write ONE reply the seller can send to the customer.
Language: ${language === 'en' ? 'English' : 'Thai'}.
Style: ${style}.
Product context: ${productName || 'general store'}.
Customer said: "${msg}"

Return ONLY the reply text.`;

  const ollamaMs = Number(process.env.OS_PRO_TOOLS_OLLAMA_MS || 8000);
  try {
    const local = await withTimeout(replyViaLocalOllama(prompt, []), ollamaMs);
    const text = stripFences(local?.message);
    if (text && text.length > 8) {
      return { reply: text, source: 'qwen_local' };
    }
  } catch (e) {
    console.warn('[osProTools] ollama reply:', e?.message || e);
  }

  if (language === 'en') {
    return {
      reply: `Thanks for your message! Regarding ${productName || 'this item'}, we currently have stock available. Happy to help with sizing, shipping, or payment details.`,
      source: 'rules_fallback',
    };
  }
  return {
    reply: `ขอบคุณสำหรับข้อความค่ะ${productName ? ` เรื่อง${productName}` : ''} ตอนนี้มีสินค้าพร้อมส่ง สามารถสอบถามไซส์ การจัดส่ง หรือชำระเงินได้เลยนะคะ`,
    source: 'rules_fallback',
  };
}

/**
 * Phase 2: polish a local price recommendation blurb (Ollama optional).
 */
export async function polishSmartPricingNote({
  title = '',
  currentPrice = 0,
  suggestedPrice = 0,
  reason = '',
  language = 'th',
} = {}) {
  const prompt = `You are an AQOND marketplace pricing coach.
Language: ${language === 'en' ? 'English' : 'Thai'}.
Product: ${title}
Current price: ${currentPrice}
Suggested price: ${suggestedPrice}
Rule reason: ${reason}

Write ONE short coaching sentence (max 28 words) explaining why the merchant should consider the suggested price.
Return ONLY the sentence.`;

  const ollamaMs = Number(process.env.OS_PRO_TOOLS_OLLAMA_MS || 8000);
  try {
    const local = await withTimeout(replyViaLocalOllama(prompt, []), ollamaMs);
    const text = stripFences(local?.message);
    if (text && text.length > 12) {
      return { note: text, source: 'qwen_local' };
    }
  } catch (e) {
    console.warn('[osProTools] ollama pricing:', e?.message || e);
  }

  if (language === 'en') {
    return {
      note: `Move ${title || 'this SKU'} from ${currentPrice} toward ${suggestedPrice} — ${reason || 'aligns with stock and demand signals'}.`,
      source: 'rules_fallback',
    };
  }
  return {
    note: `แนะนำปรับราคา${title ? `ของ${title}` : ''}จาก ${currentPrice} ไปทาง ${suggestedPrice} — ${reason || 'ให้สอดคล้องสัญญาณสต็อกและความต้องการ'}`,
    source: 'rules_fallback',
  };
}

/**
 * Phase 2: product photo assist stub (queue acknowledgment).
 * Real remove-bg provider lands in a later slice.
 */
export function enqueuePhotoAssistStub({
  productName = '',
  fileName = '',
} = {}) {
  return {
    jobId: `photo-${Date.now()}`,
    status: 'queued',
    productName: String(productName || 'product'),
    fileName: String(fileName || 'upload.jpg'),
    message:
      'Photo assist queued (stub). Background removal provider not wired yet — local UI will mark done.',
    source: 'photo_stub',
  };
}
