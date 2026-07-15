/**
 * Phase 3 — Brain retrieve+reply + webhook test helpers for Pro Enterprise.
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
        timer = setTimeout(() => reject(new Error('pro_enterprise_timeout')), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * @param {{ question: string, knowledge?: string[], botName?: string, tone?: string, language?: string }} input
 */
export async function replyProBrainChat({
  question = '',
  knowledge = [],
  botName = 'Store Bot',
  tone = 'friendly',
  language = 'th',
} = {}) {
  const q = String(question || '').trim();
  if (!q) {
    const err = new Error('question_required');
    err.status = 400;
    throw err;
  }

  const ctx = (Array.isArray(knowledge) ? knowledge : [])
    .map((k) => String(k || '').trim())
    .filter(Boolean)
    .slice(0, 6)
    .join('\n---\n')
    .slice(0, 3500);

  const prompt = `You are ${botName}, an AQOND store chatbot.
Tone: ${tone}.
Language: ${language === 'en' ? 'English' : 'Thai'}.
Answer ONLY using the knowledge below when possible. If missing, say you will check with the merchant.
Keep under 90 words. No markdown fences.

KNOWLEDGE:
${ctx || '(empty — say you still need merchant knowledge upload)'}

CUSTOMER:
${q}`;

  const ollamaMs = Number(process.env.OS_PRO_TOOLS_OLLAMA_MS || 8000);
  try {
    const local = await withTimeout(replyViaLocalOllama(prompt, []), ollamaMs);
    const text = stripFences(local?.message);
    if (text && text.length > 8) {
      return { reply: text, source: 'qwen_local', usedChunks: knowledge?.length || 0 };
    }
  } catch (e) {
    console.warn('[osProEnterprise] ollama brain:', e?.message || e);
  }

  if (!ctx) {
    if (language === 'en') {
      return {
        reply: `${botName} here — please upload store knowledge so I can answer accurately.`,
        source: 'rules_fallback',
        usedChunks: 0,
      };
    }
    return {
      reply: `${botName} ครับ/ค่ะ — ยังไม่มี knowledge ในบอทนี้ กรุณาอัปโหลดข้อมูลร้านก่อนนะคะ`,
      source: 'rules_fallback',
      usedChunks: 0,
    };
  }

  const snip = ctx.slice(0, 280);
  if (language === 'en') {
    return {
      reply: `Based on our store notes: ${snip}${ctx.length > 280 ? '…' : ''}`,
      source: 'rules_fallback',
      usedChunks: knowledge?.length || 0,
    };
  }
  return {
    reply: `จากข้อมูลร้าน: ${snip}${ctx.length > 280 ? '…' : ''}`,
    source: 'rules_fallback',
    usedChunks: knowledge?.length || 0,
  };
}

/**
 * Fire a test webhook ping (server-side fetch).
 */
export async function pingProWebhook({
  url = '',
  event = 'pro.test',
  payload = {},
} = {}) {
  const target = String(url || '').trim();
  if (!/^https?:\/\//i.test(target)) {
    const err = new Error('invalid_webhook_url');
    err.status = 400;
    throw err;
  }
  const body = {
    event,
    source: 'aqond_pro',
    ts: new Date().toISOString(),
    data: payload || {},
  };
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 8000);
  try {
    const res = await fetch(target, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-AQOND-Pro-Event': event,
      },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    return {
      ok: res.ok,
      status: res.status,
      message: res.ok ? 'delivered' : `http_${res.status}`,
    };
  } catch (e) {
    return {
      ok: false,
      status: 0,
      message: e?.name === 'AbortError' ? 'timeout' : String(e?.message || e),
    };
  } finally {
    clearTimeout(timer);
  }
}
