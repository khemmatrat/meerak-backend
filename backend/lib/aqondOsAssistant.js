/**
 * AQOND OS Assistant — Super App chat
 * Primary: Hermes (+ Jarvis when commerce) → Qwen Thai via ai-core POST /v1/os/chat
 * Fallback: FAQ → rules → optional Gemini
 */
import { GoogleGenerativeAI } from '@google/generative-ai';
import { searchFaq } from './faqKnowledge.js';
import { maskPiiForLlm, maskMessagesArrayForLlm } from './piiMask.js';
import { replyViaLocalOllama } from './osChatOllama.js';
import {
  searchMarketplaceForChat,
  formatProductSearchThai,
  productsToActionCards,
  extractProductQuery,
  isProductSearchIntentMessage,
} from './osMarketplaceSearch.js';
import {
  isServiceIntentMessage,
  searchServicesForChat,
  formatServiceSearchThai,
  providersToActionCards,
} from './osServiceSearch.js';
import { buildCompassStatus, getCompassKycPrefill } from './compassOnboarding.js';
import { upsertProgressFromStatus } from './partnerOnboardingProgress.js';
import { proposeTool } from './hermesToolRegistry.js';

const genAI = process.env.GEMINI_API_KEY
  ? new GoogleGenerativeAI(process.env.GEMINI_API_KEY)
  : null;

const AI_CORE_BASE = () =>
  (process.env.AI_CORE_URL || 'http://127.0.0.1:8100').replace(/\/$/, '');
const AI_CORE_KEY = () => process.env.AI_CORE_API_KEY || '';
const OS_CHAT_TIMEOUT_MS = Number(process.env.OS_CHAT_TIMEOUT_MS || 90000);

const OS_SYSTEM_PROMPT = `คุณคือ AQOND AI Assistant ผู้ช่วยอัจฉริยะของซูเปอร์แอป AQOND
โมดูลหลัก: Marketplace, Food Merchant, Job Board, Booking, Talents OS, Rider OS, CRM

บุคลิก:
- สุภาพ เป็นมิตร ใช้คำลงท้าย "ครับ" เมื่อตอบภาษาไทย
- ตอบกระชับ ชัดเจน เป็นข้อ ๆ เมื่อแนะนำขั้นตอน
- ช่วยแนะนำเส้นทางในแอป ไม่เดาข้อมูลราคา/สถานะงานที่ไม่มีในบริบท

กฎ:
- ถ้าถามหางาน → แนะนำไป Job Board / Talents
- ถ้าถามซื้อสินค้า → Marketplace
- ถ้าถามอาหาร → Food Merchant
- ถ้าถามจองห้อง/นัด → Booking
- ถ้าถามส่งของ → Rider OS
- ถ้าไม่เกี่ยวกับ AQOND ให้บอกอย่างสุภาพว่าช่วยเรื่องซูเปอร์แอปเป็นหลัก
- ห้ามเปิดเผยข้อมูลส่วนตัวของผู้อื่น ห้ามตกลงคืนเงินเอง`;

/** Follow-up refine on prior product search (ถูกที่สุด, แพงสุด, …) */
function detectProductRefine(message) {
  const t = String(message || '').trim().toLowerCase();
  if (!t || t.length > 48) return null;
  if (
    /ถูกที่สุด|ถูกสุด|ราคาถูกสุด|ถูกหน่อย|ถูกกว่า|ถูกสุดๆ|cheapest|cheaper|lowest\s*price|sort.*price|อันถูก/.test(
      t,
    )
  ) {
    return 'cheapest';
  }
  if (/แพงสุด|แพงที่สุด|ราคาแพง|most\s*expensive|priciest|สูงสุด/.test(t) && !/ช่าง|บริการ|รปภ/.test(t)) {
    return 'priciest';
  }
  return null;
}

const ONBOARDING_ZONE_LABEL = {
  rider: 'ไรเดอร์',
  merchant: 'ร้านค้า',
  partner_skill: 'พาร์ทเนอร์บริการ',
};

/**
 * Detect a partner-onboarding intent (become rider/merchant/skill partner, or continue an
 * existing onboarding). Returns a zone hint ('rider'|'merchant'|'partner_skill'|'auto') or null.
 * Kept intentionally specific so it does not steal buyer/job-seeker traffic.
 */
function detectPartnerOnboarding(message) {
  const t = String(message || '').toLowerCase();
  if (!t || t.length > 160) return null;
  // seller / merchant
  if (
    /เปิดร้าน|สมัครร้าน|ลงทะเบียนร้าน|เป็นร้านค้า|อยากขายของ|ขายของบนแอป|ขายของในแอป|เปิดร้านอาหาร|เป็นแม่ค้า|เป็นพ่อค้า|เป็นร้าน|open\s*shop|merchant\s*(register|onboard)/.test(
      t,
    )
  ) {
    return 'merchant';
  }
  // rider / delivery
  if (
    /(สมัคร|อยากเป็น|อยากขับ|เป็น|ลงทะเบียน|register).{0,8}(ไรเดอร์|rider|คนขับ|ขับรถส่ง|ส่งของ|ส่งอาหาร|คนส่ง)/.test(
      t,
    ) ||
    /สมัครขับ|สมัครส่งของ|สมัครไรเดอร์/.test(t)
  ) {
    return 'rider';
  }
  // partner skill / provider (ช่างแอร์, แม่บ้าน, เชฟ, เพื่อนเที่ยว ฯลฯ)
  if (
    /(สมัคร|อยากเป็น|เป็น|ลงทะเบียน|register|รับงาน).{0,10}(พาร์ทเนอร์|partner|ช่างแอร์|ช่าง|แม่บ้าน|เชฟ|ทำความสะอาด|ฟรีแลนซ์|freelance|เพื่อนเที่ยว|ช่างตัดผม|ตัดผม|นวด|talent)/.test(
      t,
    )
  ) {
    return 'partner_skill';
  }
  // continue / status of an existing onboarding (zone resolved from profile)
  if (
    /สมัครถึงไหน|สมัครค้าง|สมัครต่อ|สมัครไม่เสร็จ|ลงทะเบียนต่อ|onboarding|กรอกเอกสารต่อ|สมัครพาร์ทเนอร์|ทำเอกสารต่อ|ขั้นตอนสมัคร/.test(
      t,
    )
  ) {
    return 'auto';
  }
  return null;
}

/** Extract an explicit shop name from a "เปิดร้านชื่อ ..." command (conservative). */
function extractShopName(text) {
  const m = String(text || '').match(
    /(?:เปิด|สร้าง|ลงทะเบียน)ร้าน(?:ค้า|อาหาร)?\s*(?:ชื่อว่า|ชื่อ|name)\s*[:：]?\s*[“"']?([^“"'\n]{1,60})/i,
  );
  if (!m) return null;
  let name = m[1].trim().replace(/[.。,、!?]+$/, '').trim();
  name = name.replace(/\s*(ให้เลย|ให้หน่อย|ให้ที|ครับ|ค่ะ|นะ|หน่อย|ด้วย)\s*$/gu, '').trim();
  return name.length >= 1 ? name.slice(0, 80) : null;
}

/** Build a consent-card reply from a tool proposal. */
function toolConsentReply(consent) {
  const lines = (consent.summary || [])
    .map((s) => `• ${s.label}: ${s.value}`)
    .join('\n');
  return {
    message: `ตรวจสอบข้อมูลก่อนส่งนะครับ 👇\n${lines}\n\n${consent.warning}`,
    intent: 'partner_onboarding_fill',
    agentUsed: 'hermes',
    entities: [{ type: 'tool', value: consent.toolId }],
    actions: [{ type: 'tool_consent', data: consent }],
    payload: { type: 'tool_consent', data: consent },
  };
}

/**
 * Detect an explicit "fill it for me / submit" command and return a consent proposal.
 * Only fires when we can build safe params. requiresConsent tools never auto-execute —
 * this only PROPOSES (which is audited); execution needs a separate confirm.
 */
async function detectAndProposeTool(pool, context, message) {
  const userId = context?.userId;
  if (!pool || !userId) return null; // must be logged in to fill sensitive data
  const t = String(message || '').toLowerCase();

  // create_shop — requires an explicit shop name
  if (/(เปิด|สร้าง|ลงทะเบียน)ร้าน/.test(t)) {
    const shopName = extractShopName(message);
    if (shopName) {
      const type = /อาหาร|ร้านอาหาร|food/.test(t) ? 'food' : 'marketplace';
      try {
        const consent = proposeTool(pool, {
          toolId: 'create_shop',
          userId: String(userId),
          params: { name: shopName, type },
        });
        return toolConsentReply(consent);
      } catch (err) {
        console.warn('[aqondOsAssistant] propose create_shop:', err?.message || err);
      }
    }
  }

  // rider_register — explicit "do it for me" command
  if (
    /(สมัคร|ลงทะเบียน).{0,6}ไรเดอร์|สมัครขับ|สมัครส่งของ/.test(t) &&
    /ให้เลย|ให้หน่อย|ให้ที|กรอกให้|สมัครให้|ช่วยสมัคร|ลงให้|เลยครับ|เลยค่ะ/.test(t)
  ) {
    let prefill = {};
    try {
      prefill = (await getCompassKycPrefill(pool, String(userId))) || {};
    } catch {
      /* optional */
    }
    try {
      const consent = proposeTool(pool, {
        toolId: 'rider_register',
        userId: String(userId),
        params: {
          display_name: prefill.display_name || undefined,
          phone: prefill.phone || undefined,
          vehicle: prefill.vehicle || 'motorcycle',
          plate: prefill.plate || undefined,
          bank_account: prefill.bank_account || undefined,
        },
      });
      return toolConsentReply(consent);
    } catch (err) {
      console.warn('[aqondOsAssistant] propose rider_register:', err?.message || err);
    }
  }

  return null;
}

/** Build a sequence-aware onboarding reply (Hermes guided navigation). */
async function buildPartnerOnboardingReply(pool, context, zoneHint) {
  const userId = context?.userId;

  // Not logged in / no pool → guide to login + survey (the actionable first step)
  if (!pool || !userId) {
    const href = zoneHint === 'merchant' ? '/m/merchant/shops' : '/onboarding/compass';
    return {
      message:
        'ยินดีช่วยสมัครพาร์ทเนอร์ครับ 🙌\nเริ่มจากเข้าสู่ระบบ/ยืนยันเบอร์ แล้วบอกเป้าหมายของคุณ จากนั้นผมจะพาไปทีละขั้นจนสมัครเสร็จครับ',
      intent: 'partner_onboarding',
      agentUsed: 'hermes',
      actions: [
        {
          type: 'onboarding_step',
          data: { id: 'survey', title: 'เริ่มสมัครพาร์ทเนอร์', open_path: href, minutes: 2 },
        },
      ],
      payload: { type: 'onboarding_step', data: { zone: zoneHint === 'auto' ? null : zoneHint, loggedIn: false, open_path: href } },
    };
  }

  let status = null;
  try {
    status = await buildCompassStatus(pool, String(userId));
  } catch (err) {
    console.warn('[aqondOsAssistant] compass status:', err?.message || err);
  }

  if (!status || !status.found) {
    return {
      message:
        'เริ่มสมัครพาร์ทเนอร์ได้เลยครับ — บอกเป้าหมายของคุณก่อน (เช่น เป็นไรเดอร์ เปิดร้าน หรือรับงานช่าง) แล้วผมจะพาไปทีละขั้นครับ',
      intent: 'partner_onboarding',
      agentUsed: 'hermes',
      actions: [
        {
          type: 'onboarding_step',
          data: { id: 'survey', title: 'บอกเป้าหมายของคุณ', open_path: '/onboarding/compass', minutes: 2 },
        },
      ],
      payload: { type: 'onboarding_step', data: { zone: null, loggedIn: true, open_path: '/onboarding/compass' } },
    };
  }

  // Persist snapshot + activity (best-effort)
  await upsertProgressFromStatus(pool, status).catch(() => {});

  const next = status.nextAction || {};
  const done = status.progress?.completed ?? 0;
  const total = status.progress?.total ?? 0;
  const zoneLabel = ONBOARDING_ZONE_LABEL[status.zone] || 'พาร์ทเนอร์';

  let message;
  if (status.allDone) {
    message = `สมัคร${zoneLabel}ครบทุกขั้นแล้วครับ 🎉 พร้อมเริ่มรับงาน/เปิดร้านได้เลยครับ`;
  } else if (!status.surveyDone) {
    message =
      'เริ่มจากบอกเป้าหมายของคุณก่อนนะครับ กดปุ่มด้านล่างเพื่อทำแบบสอบถามสั้น ๆ แล้วผมจะพาไปทีละขั้นครับ';
  } else {
    const mins = next.minutes ? ` (~${next.minutes} นาที)` : '';
    message = `ตอนนี้สมัคร${zoneLabel}คืบหน้า ${done}/${total} ขั้นแล้วครับ\nขั้นต่อไป: ${next.label || 'ดำเนินการต่อ'}${mins}\nกดปุ่มด้านล่างเพื่อไปทำต่อได้เลยครับ`;
  }

  return {
    message,
    intent: 'partner_onboarding',
    agentUsed: 'hermes',
    entities: [
      { type: 'onboarding_zone', value: status.zone },
      { type: 'onboarding_step', value: next.id },
    ],
    actions: [
      {
        type: 'onboarding_step',
        data: {
          id: next.id,
          title: next.label,
          open_path: next.href,
          minutes: next.minutes,
          progress: `${done}/${total}`,
        },
      },
    ],
    payload: {
      type: 'onboarding_step',
      data: {
        zone: status.zone,
        loggedIn: true,
        current_step: next.id,
        steps: status.steps,
        progress: status.progress,
        allDone: status.allDone,
        open_path: next.href,
      },
    },
  };
}

function histText(m) {
  return String(m?.message || m?.text || '').trim();
}

function histRole(m) {
  const r = m?.role || m?.sender || '';
  if (/^(user|User)$/i.test(r)) return 'user';
  return 'ai';
}

/** Recover last product search topic from chat history / client context */
function lastProductQueryFromHistory(history, context = {}) {
  if (context?.lastProductQuery) return String(context.lastProductQuery).trim();
  const rows = Array.isArray(history) ? history : [];
  for (let i = rows.length - 1; i >= 0; i--) {
    const text = histText(rows[i]);
    if (!text) continue;
    const fromAi = text.match(/เกี่ยวกับ\s*[“"']([^”"']+)[”"']/);
    if (fromAi?.[1]) return fromAi[1].trim();
    const fromRefine = text.match(/ผลค้นหา\s*[“"']([^”"']+)[”"']/);
    if (fromRefine?.[1]) return fromRefine[1].trim();
    if (histRole(rows[i]) === 'user') {
      if (detectProductRefine(text)) continue;
      if (isServiceIntentMessage(text)) continue;
      const intent = detectIntentBare(text);
      if (intent === 'marketplace_search' || intent === 'food_order') {
        return extractProductQuery(text);
      }
    }
  }
  return '';
}

/** Intent without refine/history (avoid recursion) */
function detectIntentBare(message) {
  const t = String(message || '').toLowerCase();
  if (isServiceIntentMessage(t)) return 'service_search';
  if (/งาน|หางาน|สมัครงาน|job|career|freelancer|talent|จ้าง(?!.*(แอร์|รปภ|ยาม|ช่าง))/.test(t)) {
    return 'job_search';
  }
  if (/อาหาร|delivery|สั่งอาหาร|wagyu|food|ร้าน|หิว/.test(t) && !/ช่าง|บริการ/.test(t)) {
    return 'food_order';
  }
  if (isProductSearchIntentMessage(t)) {
    return 'marketplace_search';
  }
  if (/จอง|booking|นัด|room|lounge|สปา|นวด/.test(t)) return 'booking';
  if (/ส่งของ|rider|คูเรียร์|courier/.test(t)) return 'rider';
  if (/crm|ยอดขาย|ธุรกิจ|analytics/.test(t)) return 'crm';
  return 'general';
}

function detectIntent(message, history = [], context = {}) {
  const refine = detectProductRefine(message);
  if (refine && lastProductQueryFromHistory(history, context)) {
    return { intent: 'marketplace_refine', agentUsed: 'hermes', refine };
  }
  const bare = detectIntentBare(message);
  return { intent: bare, agentUsed: bare === 'general' ? 'qwen' : 'hermes', refine: null };
}

function ruleBasedOsReply(message) {
  const t = String(message || '').toLowerCase();
  if (/สวัสดี|hello|hi\b|หวัดดี/.test(t) && t.length < 40) {
    return 'สวัสดีครับ ยินดีต้อนรับสู่ AQOND AI Assistant — อยากให้ช่วยหาสินค้า บริการ จองคิว หรือจับคู่งานส่วนไหนดีครับ?';
  }
  if (/งาน|หางาน|สมัครงาน|job/.test(t)) {
    return 'สำหรับงานพรีเมียมใน AQOND:\n1. เปิดเมนู Job Board จาก Sidebar\n2. กรองตามทักษะ/พื้นที่\n3. กดสมัคร — หากยังไม่ได้ล็อกอิน ระบบจะพาไปยืนยันเบอร์โทรก่อนครับ\n\nอยากให้ช่วยสรุปประเภทงานที่สนใจไหมครับ?';
  }
  if (/อาหาร|food|สั่งอาหาร|หิว/.test(t)) {
    return 'ฝั่ง Food Merchant ใช้สั่งอาหาร/สตรีทฟู้ดและของพรีเมียมได้ครับ — เปิดโมดูล Food Merchant จาก Sidebar แล้วบอกเมนูหรือพื้นที่ที่ต้องการได้เลยครับ';
  }
  if (/ซื้อ|สินค้า|marketplace/.test(t)) {
    // Generic only — specific product queries are handled by searchMarketplaceForChat
    if (!/(หา|ค้น|อยาก|ซื้อ|มี).{0,12}/.test(t) || t.length < 12) {
      return 'Marketplace รวมสินค้าคัดสรรและของพรีเมียมครับ — พิมพ์ชื่อสินค้าที่ต้องการได้เลย เช่น “หาสินค้า เสื้อเชฟ” ผมจะค้นให้ครับ';
    }
    return null;
  }
  if (/จอง|booking|นัด/.test(t)) {
    return 'Booking ใช้จองห้องประชุม เลานจ์ หรือเซสชันสุขภาพได้ครับ — เปิดโมดูล Booking แล้วเลือกประเภทบริการที่ต้องการได้เลยครับ';
  }
  if (/ส่งของ|rider|courier/.test(t)) {
    return 'Rider OS เป็นบริการส่งด่วนแบบ VIP ครับ — เปิด Rider OS จาก Sidebar แล้วระบุจุดรับ/จุดส่งได้เลยครับ';
  }
  if (/สมัคร|register|login|เข้าสู่ระบบ|line/.test(t)) {
    return 'สมัครหรือเข้าสู่ระบบได้ด้วยเบอร์โทร (OTP) ที่หน้า Welcome — กดไอคอนโปรไฟล์มุมขวาบน หรือปุ่ม Sign in ได้ครับ LINE/Google อาจเปิดใช้ภายหลังตามการตั้งค่าระบบ';
  }
  return null;
}

function buildOsPrompt(userText, history, faqContext, screenHint) {
  const hist = (history || [])
    .slice(-8)
    .map((m) => `${m.role === 'user' || m.sender === 'user' ? 'User' : 'Assistant'}: ${m.message || m.text || ''}`)
    .join('\n');

  const faqBlock = faqContext
    ? `\n\n[ความรู้ที่อนุมัติแล้ว]\nQ: ${faqContext.question}\nA: ${faqContext.best_answer}\nใช้เป็นหลักแล้วตอบในนาม AQOND AI`
    : '';

  return `${OS_SYSTEM_PROMPT}
${faqBlock}

หน้าจอปัจจุบัน: ${screenHint || 'AI_Chat_Assistant'}

ประวัติล่าสุด:
${hist || '(ยังไม่มี)'}

คำถามปัจจุบันจากผู้ใช้ (ตอบข้อนี้เป็นหลัก):
${userText}`;
}

/**
 * Call ai-core: Hermes (+ Jarvis) → Qwen Thai
 */
async function fetchOsChatFromAiCore(message, history, intent) {
  if (process.env.OS_CHAT_AI_CORE === '0') return null;

  const headers = { 'Content-Type': 'application/json' };
  const key = AI_CORE_KEY();
  if (key) headers['x-ai-core-api-key'] = key;

  const res = await fetch(`${AI_CORE_BASE()}/v1/os/chat`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      message,
      intent,
      history: (history || []).slice(-8).map((m) => ({
        role: m.role || (m.sender === 'User' || m.sender === 'user' ? 'user' : 'ai'),
        text: m.message || m.text || '',
      })),
    }),
    signal: AbortSignal.timeout(OS_CHAT_TIMEOUT_MS),
  });

  if (!res.ok) {
    const t = await res.text().catch(() => '');
    throw new Error(`ai-core os/chat ${res.status}: ${t.slice(0, 200)}`);
  }

  const data = await res.json();
  if (!data?.message) throw new Error('ai-core os/chat empty message');
  return data;
}

/**
 * @param {object|null} pool
 * @param {string} message
 * @param {Array} history
 * @param {{ currentScreen?: string, role?: string }} context
 */
export async function replyAqondOsAssistant(pool, message, history = [], context = {}) {
  const safeText = maskPiiForLlm(String(message || '').trim());
  const safeHistory = maskMessagesArrayForLlm(
    (history || []).map((m) => ({
      sender: m.role === 'user' || m.sender === 'user' ? 'User' : 'Assistant',
      message: m.message || m.text || '',
    })),
  );
  const { intent, agentUsed, refine } = detectIntent(safeText, safeHistory, context);

  if (!safeText) {
    return {
      message: 'พิมพ์ข้อความมาได้เลยครับ จะช่วยหาสินค้า บริการ จองคิว หรือจับคู่งานให้',
      intent: 'unknown',
      agentUsed: 'qwen',
    };
  }

  // Partner onboarding (Hermes = actionable, sequence-aware) — takes precedence over FAQ/LLM
  const onboardingZone = detectPartnerOnboarding(safeText);
  if (onboardingZone) {
    try {
      // First: explicit "fill it for me" → propose a consent card (Phase 2, requires confirm)
      const proposal = await detectAndProposeTool(pool, context, safeText);
      if (proposal) return proposal;
      // Otherwise: sequence-aware guided navigation
      const reply = await buildPartnerOnboardingReply(pool, context, onboardingZone);
      if (reply) return reply;
    } catch (err) {
      console.warn('[aqondOsAssistant] partner onboarding:', err?.message || err);
    }
  }

  let faqMatch = null;
  if (pool) {
    try {
      faqMatch = await searchFaq(pool, safeText);
    } catch {
      /* optional */
    }
  }

  // Prefer conversational refine over FAQ when user says "ถูกที่สุด" etc.
  if (faqMatch && Number(faqMatch.score || 0) >= 0.72 && intent !== 'marketplace_refine') {
    return {
      message: faqMatch.best_answer,
      intent,
      agentUsed: 'hermes+qwen',
      payload: { type: 'text', data: { source: 'faq', score: faqMatch.score } },
    };
  }

  // Continuity: “ถูกที่สุด” / “แพงสุด” after a prior product search
  if (intent === 'marketplace_refine') {
    try {
      const priorQuery = lastProductQueryFromHistory(safeHistory, context);
      const sort = refine === 'priciest' ? 'price_desc' : 'price_asc';
      const found = await searchMarketplaceForChat(priorQuery, {
        limit: 5,
        sort,
        queryOverride: priorQuery,
      });
      if (found.products.length) {
        const message = formatProductSearchThai(found.query, found.products, found.source, {
          sort,
          refine,
        });
        return {
          message,
          intent: 'marketplace_search',
          entities: [
            { type: 'product_query', value: found.query },
            { type: 'refine', value: refine },
          ],
          agentUsed: 'jarvis',
          actions: productsToActionCards(found.products, found.query),
          payload: {
            type: 'product_card',
            data: {
              source: found.source,
              query: found.query,
              products: found.products,
              refine,
              search_open_path: `/storefront?p=${encodeURIComponent(`/m/search?q=${encodeURIComponent(found.query)}`)}`,
            },
          },
        };
      }
      return {
        message: `จำได้ว่าคุยเรื่องสินค้าอยู่ แต่ยังหา “${priorQuery || 'รายการก่อนหน้า'}” เพิ่มไม่ได้ครับ — ลองพิมพ์ชื่อสินค้าอีกครั้ง เช่น “หาสินค้า นาฬิกา” ได้เลย`,
        intent: 'marketplace_search',
        agentUsed: 'jarvis',
        actions: [],
      };
    } catch (err) {
      console.warn('[aqondOsAssistant] marketplace refine:', err?.message || err);
    }
  }

  // Service / technician matching (ช่างแอร์, รปภ., ความปลอดภัย)
  if (intent === 'service_search' || intent === 'booking') {
    try {
      const found = await searchServicesForChat(safeText, { limit: 5 });
      if (found.providers.length) {
        const message = formatServiceSearchThai(
          found.query,
          found.providers,
          found.pack,
          found.source,
        );
        const actions = providersToActionCards(found.providers, found.pack);
        return {
          message,
          intent: 'service_search',
          entities: [
            { type: 'service_query', value: found.query },
            found.pack ? { type: 'service_pack', value: found.pack.id } : null,
          ].filter(Boolean),
          agentUsed: found.source === 'providers_api' ? 'jarvis+hermes' : 'jarvis',
          actions,
          payload: {
            type: 'service_card',
            data: {
              source: found.source,
              query: found.query,
              pack: found.pack,
              providers: found.providers,
              search_open_path: found.pack?.route || '/jobs',
            },
          },
        };
      }
    } catch (err) {
      console.warn('[aqondOsAssistant] service search:', err?.message || err);
    }
  }

  // Jarvis-style: actually search products when user asks for goods
  if (intent === 'marketplace_search' || intent === 'food_order') {
    try {
      const found = await searchMarketplaceForChat(safeText, { limit: 5 });
      if (found.products.length) {
        let message = formatProductSearchThai(found.query, found.products, found.source);
        if (process.env.OS_CHAT_PRODUCT_QWEN === '1') {
          try {
            const local = await replyViaLocalOllama(
              `ผู้ใช้ถาม: ${safeText}\nแต่งคำตอบภาษาไทยแนะนำสินค้าต่อไปนี้ให้ดูเป็นมิตร (อย่าแต่งราคา/ชื่อใหม่):\n${JSON.stringify(found.products.slice(0, 5))}`,
              safeHistory,
            );
            if (local?.message && local.message.length > 40) {
              message = local.message;
            }
          } catch {
            /* keep formatted list */
          }
        }

        const actions = productsToActionCards(found.products, found.query);
        return {
          message,
          intent: 'marketplace_search',
          entities: [{ type: 'product_query', value: found.query }],
          agentUsed: found.source === 'storefront' ? 'jarvis+qwen' : 'jarvis',
          actions,
          payload: {
            type: 'product_card',
            data: {
              source: found.source,
              query: found.query,
              products: found.products,
              search_open_path: `/storefront?p=${encodeURIComponent(`/m/search?q=${encodeURIComponent(found.query)}`)}`,
            },
          },
        };
      }
      // No match — tell user honestly (don't invent unrelated catalog)
      return {
        message: formatProductSearchThai(found.query || safeText, [], 'empty'),
        intent: 'marketplace_search',
        entities: [{ type: 'product_query', value: found.query }],
        agentUsed: 'jarvis',
        actions: [],
        payload: {
          type: 'text',
          data: {
            source: 'empty',
            query: found.query,
            search_open_path: `/storefront?p=${encodeURIComponent(`/m/search?q=${encodeURIComponent(found.query || '')}`)}`,
          },
        },
      };
    } catch (err) {
      console.warn('[aqondOsAssistant] marketplace search:', err?.message || err);
    }
  }

  // Primary: Hermes (+ Jarvis) → Qwen via ai-core
  try {
    const ai = await fetchOsChatFromAiCore(safeText, safeHistory, intent);
    if (ai?.message) {
      return {
        message: ai.message,
        intent: ai.intent || intent,
        agentUsed: ai.agentUsed || ai.source || 'hermes+qwen',
        payload: {
          type: 'text',
          data: {
            source: ai.source || 'hermes+qwen',
            sources: ai.sources || null,
            jarvis: ai.jarvis || null,
            latency_ms: ai.latency_ms || null,
          },
        },
      };
    }
  } catch (err) {
    console.warn('[aqondOsAssistant] ai-core os/chat unavailable:', err?.message || err);
  }

  // Local Ollama: (Hermes if present) → Qwen Thai
  try {
    const local = await replyViaLocalOllama(safeText, safeHistory);
    if (local?.message) {
      return {
        message: local.message,
        intent: local.intent || intent,
        agentUsed: local.agentUsed || 'qwen',
        payload: {
          type: 'text',
          data: { source: local.source || 'qwen_local', sources: local.sources || null },
        },
      };
    }
  } catch (err) {
    console.warn('[aqondOsAssistant] local Ollama unavailable:', err?.message || err);
  }

  // Optional Gemini (opt-in; often quota-exhausted)
  if (process.env.OS_CHAT_ALLOW_GEMINI === '1') {
    try {
      if (genAI && process.env.GEMINI_API_KEY) {
        const modelName = process.env.GEMINI_MODEL || 'gemini-2.0-flash';
        const model = genAI.getGenerativeModel({
          model: modelName,
          generationConfig: { temperature: 0.65, maxOutputTokens: 1024 },
        });
        const faqContext = faqMatch && faqMatch.score >= 0.4 ? faqMatch : null;
        const prompt = buildOsPrompt(
          safeText,
          safeHistory,
          faqContext,
          context.currentScreen || 'AI_Chat_Assistant',
        );
        const result = await model.generateContent(prompt);
        const aiText = (result?.response?.text?.() || '').trim();
        if (aiText) {
          return {
            message: aiText,
            intent,
            agentUsed: 'gemini',
          };
        }
      }
    } catch (err) {
      console.error('[aqondOsAssistant] Gemini error:', err?.message || err);
    }
  }

  const rule = ruleBasedOsReply(safeText);
  return {
    message:
      rule ||
      'รับทราบครับ — เปิดโมดูลที่เกี่ยวข้องจาก Sidebar ได้เลย หรือบอกละเอียดขึ้นอีกนิดว่าต้องการ Marketplace, อาหาร, งาน, การจอง หรือ Rider ครับ',
    intent,
    agentUsed: rule ? agentUsed : 'qwen',
    payload: { type: 'text', data: { source: 'rules_fallback' } },
  };
}

export { detectIntent, ruleBasedOsReply, OS_SYSTEM_PROMPT, fetchOsChatFromAiCore };
