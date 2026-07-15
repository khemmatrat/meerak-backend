/**
 * Direct Ollama path when ai-core is down.
 * Hermes-style facts (rules or chat model) → Qwen Thai polish.
 */
const OLLAMA_HOST = () =>
  (process.env.OLLAMA_HOST || 'http://127.0.0.1:11434').replace(/\/$/, '');
const OLLAMA_CHAT = () =>
  process.env.OLLAMA_MODEL_CHAT || process.env.OLLAMA_MODEL_HERMES || 'hermes3:3b';
const OLLAMA_PROSE = () =>
  process.env.OLLAMA_MODEL_PROSE ||
  process.env.OLLAMA_MODEL_QWEN ||
  'qwen2.5:7b-instruct';
const TIMEOUT = () => Number(process.env.OLLAMA_TIMEOUT_MS || 120000);

function detectIntent(message) {
  const t = String(message || '').toLowerCase();
  if (/งาน|หางาน|สมัครงาน|job|career|freelancer|talent|จ้าง/.test(t)) return 'job_search';
  if (/อาหาร|delivery|สั่งอาหาร|wagyu|food|ร้าน|หิว/.test(t)) return 'food_order';
  if (/ซื้อ|สินค้า|marketplace|shopping|คีย์บอร์ด|หนัง|ราคา/.test(t)) return 'marketplace_search';
  if (/จอง|booking|นัด|room|lounge|สปา/.test(t)) return 'booking';
  if (/ส่งของ|rider|คูเรียร์|courier/.test(t)) return 'rider';
  if (/crm|ยอดขาย|ธุรกิจ|analytics/.test(t)) return 'crm';
  if (/สวัสดี|hello|hi\b|หวัดดี/.test(t) && t.length < 40) return 'greeting';
  return 'general';
}

function buildFacts(message, intent) {
  const packs = {
    job_search: {
      module: 'Job Board',
      steps_en: [
        'Open Job Board from Sidebar',
        'Filter by skill/area',
        'Apply (phone OTP if not logged in)',
      ],
    },
    food_order: {
      module: 'Food Merchant',
      steps_en: ['Open Food Merchant from Sidebar', 'Choose menu/area', 'Confirm order'],
    },
    marketplace_search: {
      module: 'Marketplace',
      steps_en: ['Open Marketplace from Sidebar', 'Search or browse', 'Checkout'],
    },
    booking: {
      module: 'Booking',
      steps_en: ['Open Booking from Sidebar', 'Pick room/lounge/wellness', 'Confirm time'],
    },
    rider: {
      module: 'Rider OS',
      steps_en: ['Open Rider OS from Sidebar', 'Set pickup/dropoff', 'Confirm VIP courier'],
    },
    crm: {
      module: 'CRM',
      steps_en: ['Open CRM from Sidebar', 'Review pipelines and metrics'],
    },
    greeting: {
      module: 'AQOND OS',
      steps_en: ['Offer help for Marketplace, Food, Jobs, Booking, Rider, CRM'],
    },
    general: {
      module: 'AQOND OS',
      steps_en: ['Clarify which module they need'],
    },
  };
  const p = packs[intent] || packs.general;
  return {
    intent,
    module: p.module,
    nav_hint: `Sidebar → ${p.module}`,
    steps_en: p.steps_en,
    facts_en: `User asked: ${message}. Guide via ${p.module}: ${p.steps_en.join('; ')}.`,
  };
}

async function ollamaChat(model, messages, options = {}) {
  const r = await fetch(`${OLLAMA_HOST()}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      messages,
      stream: false,
      options: { temperature: 0.45, num_predict: 512, ...options },
    }),
    signal: AbortSignal.timeout(TIMEOUT()),
  });
  if (!r.ok) {
    const t = await r.text().catch(() => '');
    throw new Error(`ollama ${r.status}: ${t.slice(0, 180)}`);
  }
  const data = await r.json();
  return (data.message?.content || '').trim();
}

async function listModels() {
  const r = await fetch(`${OLLAMA_HOST()}/api/tags`, {
    signal: AbortSignal.timeout(5000),
  });
  if (!r.ok) return [];
  const data = await r.json();
  return (data.models || []).map((m) => m.name);
}

function pickModel(available, preferred, fallbacks = []) {
  const names = available.map((n) => String(n));
  const want = [preferred, ...fallbacks].filter(Boolean);
  for (const w of want) {
    const hit = names.find((n) => n === w || n.startsWith(`${w}:`) || n.startsWith(w));
    if (hit) return hit;
  }
  // loose match qwen instruct
  const qwen = names.find((n) => /qwen2\.5:7b-instruct/i.test(n) || /qwen.*instruct/i.test(n));
  return qwen || names[0] || preferred;
}

/**
 * @returns {Promise<{ message: string, intent: string, agentUsed: string, source: string, sources: object }|null>}
 */
export async function replyViaLocalOllama(message, history = []) {
  if (process.env.OS_CHAT_OLLAMA === '0') return null;

  let models = [];
  try {
    models = await listModels();
  } catch (e) {
    throw new Error(`ollama unreachable: ${e.message}`);
  }
  if (!models.length) throw new Error('ollama has no models');

  const intent = detectIntent(message);
  const facts = buildFacts(message, intent);

  const proseModel = pickModel(models, OLLAMA_PROSE(), [
    'qwen2.5:7b-instruct',
    'qwen2.5:7b',
    'qwen2.5-coder:7b',
    'qwen2.5-coder:1.5b',
    'qwen2.5vl:3b',
  ]);
  const chatModel = pickModel(models, OLLAMA_CHAT(), [
    'hermes3:3b',
    'hermes3:8b',
    proseModel,
  ]);

  // Prefer smaller Qwen if 7b crashes on this host (optional)
  let modelForProse = proseModel;
  if (process.env.OS_CHAT_QWEN_SMALL === '1') {
    modelForProse = pickModel(models, 'qwen2.5-coder:1.5b', ['qwen2.5vl:3b', proseModel]);
  }

  let enrichedFacts = facts;
  const sources = { structure: 'rules', prose: null, jarvis: null };

  // Optional Hermes-style structure pass (skip if same as prose-only rules)
  if (chatModel && chatModel !== proseModel && /hermes/i.test(chatModel)) {
    try {
      const raw = await ollamaChat(
        chatModel,
        [
          {
            role: 'user',
            content: `Return JSON only for AQOND OS navigation:\n{"intent":"","module":"","nav_hint":"","steps_en":[],"facts_en":""}\nUser: ${message}`,
          },
        ],
        { temperature: 0.2, num_predict: 280 },
      );
      const jsonMatch = raw.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        enrichedFacts = { ...facts, ...parsed, intent: parsed.intent || intent };
        sources.structure = 'hermes';
      }
    } catch (e) {
      console.warn('[osChatOllama] hermes structure skipped:', e.message);
    }
  }

  const hist = (history || [])
    .slice(-6)
    .map((m) => `${m.sender || m.role}: ${m.message || m.text || ''}`)
    .join('\n');

  let thai = '';
  const tryModels = [modelForProse];
  const small = pickModel(models, 'qwen2.5-coder:1.5b', ['qwen2.5vl:3b']);
  if (small && small !== modelForProse) tryModels.push(small);

  let usedProse = modelForProse;
  let lastErr = null;
  for (const m of tryModels) {
    try {
      thai = await ollamaChat(m, [
        {
          role: 'system',
          content:
            'คุณคือ AQOND AI Assistant ตอบภาษาไทยธรรมชาติ ใช้คำลงท้ายครับ กระชับ เป็นข้อเมื่อแนะนำขั้นตอน ห้าม JSON',
        },
        {
          role: 'user',
          content: `คำถาม: ${message}\n\nประวัติ:\n${hist || '(ว่าง)'}\n\nข้อมูลนำทาง (จาก Hermes/กฎ):\n${JSON.stringify(enrichedFacts, null, 2)}\n\nแต่งคำตอบภาษาไทยสำหรับผู้ใช้แอป`,
        },
      ]);
      if (thai) {
        usedProse = m;
        break;
      }
    } catch (e) {
      lastErr = e;
      console.warn('[osChatOllama] prose model failed:', m, e.message);
    }
  }

  if (!thai) throw lastErr || new Error('qwen empty reply');

  sources.prose = 'qwen';
  sources.prose_model = usedProse;
  return {
    message: thai,
    intent: enrichedFacts.intent || intent,
    agentUsed: sources.structure === 'hermes' ? 'hermes+qwen' : 'qwen',
    source: sources.structure === 'hermes' ? 'hermes+qwen' : 'qwen_local',
    sources,
  };
}
