/**
 * AQOND OS AI routes — orchestrator + thin Hermes / Jarvis / Qwen proxies.
 */
import { replyAqondOsAssistant, detectIntent } from './aqondOsAssistant.js';
import { replyViaLocalOllama } from './osChatOllama.js';
import {
  generateProductDescription,
  generateAutoReplySuggestion,
  polishSmartPricingNote,
  enqueuePhotoAssistStub,
} from './osProTools.js';
import {
  createProVideoJob,
  refreshProVideoJob,
  getProVideoJob,
  publicJobView,
  resolveProVideoProvider,
} from './osProVideo.js';
import { replyProBrainChat, pingProWebhook } from './osProEnterprise.js';
import {
  generateReviewReply,
  polishSocialPost,
  getProQuotaForUser,
  syncProQuotaForUser,
} from './osProGrowth.js';

const AI_CORE_BASE = () =>
  (process.env.AI_CORE_URL || 'http://127.0.0.1:8100').replace(/\/$/, '');
const AI_CORE_KEY = () => process.env.AI_CORE_API_KEY || '';

function aiCoreHeaders() {
  const headers = { 'Content-Type': 'application/json' };
  const key = AI_CORE_KEY();
  if (key) headers['x-ai-core-api-key'] = key;
  return headers;
}

function modelsFromPayload(payload) {
  const src = payload?.payload?.data?.sources || {};
  const used = [];
  if (src.jarvis) used.push('jarvis');
  if (src.structure === 'hermes' || String(payload.agentUsed || '').includes('hermes')) {
    used.push('hermes');
  }
  if (src.prose === 'qwen' || String(payload.agentUsed || '').includes('qwen')) {
    used.push('qwen');
  }
  if (!used.length && payload.agentUsed) {
    String(payload.agentUsed)
      .split(/[+/,]/)
      .map((s) => s.trim())
      .filter(Boolean)
      .forEach((m) => used.push(m));
  }
  return [...new Set(used.length ? used : ['rules'])];
}

function buildActions(payload) {
  const actions = [];
  if (Array.isArray(payload?.actions) && payload.actions.length) {
    return payload.actions;
  }
  const products =
    payload?.payload?.data?.products ||
    payload?.payload?.data?.jarvis?.products ||
    null;
  if (Array.isArray(products)) {
    for (const p of products.slice(0, 3)) {
      actions.push({
        type: 'product_card',
        data: {
          id: p.id,
          title: p.title || p.name,
          description: p.merchant_name || p.description,
          price: p.price ?? (p.price_micro != null ? Math.round(p.price_micro / 1e6) : undefined),
          image: p.image || p.imageUrl || p.image_url,
          open_path:
            p.open_path ||
            `/storefront?p=${encodeURIComponent(p.url_path || `/m/product/${p.id}`)}`,
        },
      });
    }
  }
  if (payload?.payload?.type && payload.payload.type !== 'text' && payload.payload.data) {
    actions.push({ type: payload.payload.type, data: payload.payload.data });
  }
  return actions;
}

function wrapOrchestratorResult(raw, startedAt) {
  const modelsUsed = modelsFromPayload(raw);
  const fallbackUsed =
    raw?.payload?.data?.source === 'rules_fallback' ||
    modelsUsed.includes('rules');
  const actions = buildActions(raw);
  return {
    success: true,
    message: raw.message,
    intent: raw.intent || 'general',
    entities: raw.entities || [],
    agentUsed: raw.agentUsed || modelsUsed.join('+') || 'qwen',
    actions,
    payload: raw.payload,
    metadata: {
      processingTime: Date.now() - startedAt,
      modelsUsed,
      fallbackUsed,
    },
  };
}

/**
 * @param {import('express').Express} app
 * @param {{ pool?: any, optionalAuth?: Function }} deps
 */
export function attachAqondOsAiRoutes(app, { pool, optionalAuth } = {}) {
  const auth = optionalAuth || ((_req, _res, next) => next());

  const orchestratorHandler = async (req, res) => {
    const started = Date.now();
    try {
      const message = String(req.body?.message || '').trim();
      if (!message) {
        return res.status(400).json({
          success: false,
          error: 'message_required',
          message: 'กรุณาพิมพ์ข้อความครับ',
          intent: 'unknown',
          entities: [],
          agentUsed: 'qwen',
          metadata: { processingTime: 0, modelsUsed: [], fallbackUsed: true },
        });
      }

      const history = Array.isArray(req.body?.history) ? req.body.history : [];
      const context =
        req.body?.context && typeof req.body.context === 'object' ? req.body.context : {};
      if (req.user?.id && !context.role) {
        context.role = req.user.role || 'customer';
      }
      // Sequence-aware onboarding needs the user id (from JWT or client body)
      if (!context.userId) {
        context.userId = req.user?.id || req.body?.userId || null;
      }

      const result = await replyAqondOsAssistant(pool || null, message, history, context);
      return res.json(wrapOrchestratorResult(result, started));
    } catch (e) {
      console.error('POST /api/ai/orchestrator:', e?.message || e);
      return res.status(500).json({
        success: false,
        error: 'orchestrator_failed',
        message: 'ขออภัยครับ ระบบ AI เกิดข้อขัดข้องชั่วคราว กรุณาลองใหม่อีกครั้งครับ',
        intent: 'unknown',
        entities: [],
        agentUsed: 'qwen',
        metadata: {
          processingTime: Date.now() - started,
          modelsUsed: [],
          fallbackUsed: true,
        },
      });
    }
  };

  /** Hermes intent/facts only */
  const hermesIntentHandler = async (req, res) => {
    try {
      const message = String(req.body?.message || '').trim();
      if (!message) {
        return res.status(400).json({ intent: 'unknown', entities: [], confidence: 0 });
      }

      // Prefer ai-core structure pass
      try {
        const r = await fetch(`${AI_CORE_BASE()}/v1/os/chat`, {
          method: 'POST',
          headers: aiCoreHeaders(),
          body: JSON.stringify({
            message,
            intent: detectIntent(message).intent,
          }),
          signal: AbortSignal.timeout(Number(process.env.OS_CHAT_TIMEOUT_MS || 60000)),
        });
        if (r.ok) {
          const data = await r.json();
          return res.json({
            intent: data.intent || detectIntent(message).intent,
            entities: data.entities || [],
            action: data.facts?.action || 'open_module',
            confidence: 0.75,
            module: data.facts?.module,
            facts: data.facts || null,
            data: data.facts || null,
          });
        }
      } catch (e) {
        console.warn('[hermes/intent] ai-core:', e?.message || e);
      }

      const { intent } = detectIntent(message);
      return res.json({
        intent,
        entities: [],
        action: 'open_module',
        confidence: 0.55,
        module: intent,
        facts: { intent, source: 'rules' },
      });
    } catch (e) {
      console.error('POST /api/ai/hermes/intent:', e?.message || e);
      return res.status(500).json({
        intent: 'unknown',
        entities: [],
        confidence: 0,
        error: 'hermes_failed',
      });
    }
  };

  /** Jarvis concierge proxy → ai-core */
  const jarvisHandler = async (req, res) => {
    try {
      const message = String(
        req.body?.message || req.body?.user_message || '',
      ).trim();
      if (!message) {
        return res.status(400).json({
          type: 'none',
          results: [],
          message: 'message required',
        });
      }

      const r = await fetch(`${AI_CORE_BASE()}/v1/jarvis/concierge`, {
        method: 'POST',
        headers: aiCoreHeaders(),
        body: JSON.stringify({
          user_message: message,
          session: req.body?.session || {},
          feed_context: req.body?.feed_context || null,
        }),
        signal: AbortSignal.timeout(Number(process.env.OS_CHAT_TIMEOUT_MS || 60000)),
      });

      if (!r.ok) {
        const t = await r.text().catch(() => '');
        throw new Error(`ai-core jarvis ${r.status}: ${t.slice(0, 160)}`);
      }

      const data = await r.json();
      return res.json({
        type: data.jarvis?.action === 'search' ? 'search' : 'recommendation',
        results: data.products || data.compare || [],
        message: data.jarvis?.reply_th || '',
        jarvis: data.jarvis,
        products: data.products,
        ok: true,
      });
    } catch (e) {
      console.warn('[jarvis/concierge]', e?.message || e);
      return res.json({
        type: 'none',
        results: [],
        message: '',
        jarvis: {
          reply_th: 'ตอนนี้ Jarvis ยังเชื่อมต่อไม่ได้ครับ ลองถามใหม่หรือเปิด Marketplace จาก Sidebar ได้เลย',
          action: 'none',
          source: 'rules_fallback',
        },
      });
    }
  };

  /** Qwen polish — structured → natural Thai */
  const qwenPolishHandler = async (req, res) => {
    try {
      const message = String(req.body?.message || '').trim();
      const structured = req.body?.structured || {};
      const composed = `ข้อมูลจาก Hermes/Jarvis:\n${JSON.stringify(structured).slice(0, 2000)}\n\nคำถามผู้ใช้: ${message}`;

      try {
        const local = await replyViaLocalOllama(composed, []);
        if (local?.message) {
          return res.json({ message: local.message, text: local.message, language: 'th' });
        }
      } catch (e) {
        console.warn('[qwen/polish] ollama:', e?.message || e);
      }

      const result = await replyAqondOsAssistant(pool || null, message, [], {
        currentScreen: 'qwen_polish',
      });
      return res.json({
        message: result.message,
        text: result.message,
        language: 'th',
      });
    } catch (e) {
      console.error('POST /api/ai/qwen/polish:', e?.message || e);
      return res.status(500).json({
        message: 'ขออภัยครับ Qwen ยังไม่พร้อม ลองใหม่อีกครั้งได้เลยครับ',
        text: 'ขออภัยครับ Qwen ยังไม่พร้อม ลองใหม่อีกครั้งได้เลยครับ',
      });
    }
  };

  const qwenChatHandler = async (req, res) => {
    try {
      const message = String(req.body?.message || '').trim();
      const result = await replyAqondOsAssistant(pool || null, message, [], {
        currentScreen: 'qwen_direct',
      });
      return res.json({ message: result.message });
    } catch (e) {
      console.error('POST /api/ai/qwen/chat:', e?.message || e);
      return res.status(500).json({ message: 'Qwen Agent ไม่พร้อมใช้งานในขณะนี้' });
    }
  };

  /** Phase 0: Pro Toolkit — product description */
  const proDescHandler = async (req, res) => {
    const started = Date.now();
    try {
      const productName = String(
        req.body?.product_name || req.body?.productName || '',
      ).trim();
      if (!productName) {
        return res.status(400).json({
          success: false,
          error: 'product_name_required',
          message: 'กรุณาระบุชื่อสินค้า',
        });
      }
      const out = await generateProductDescription({
        productName,
        features: String(req.body?.features || ''),
        tone: String(req.body?.tone || 'professional'),
        language: String(req.body?.language || 'th'),
      });
      return res.json({
        success: true,
        description: out.description,
        source: out.source,
        model: out.model || null,
        tier: req.body?.tier || null,
        metadata: { processingTime: Date.now() - started },
      });
    } catch (e) {
      console.error('POST /api/ai/pro/product-description:', e?.message || e);
      return res.status(e?.status || 500).json({
        success: false,
        error: e?.message || 'pro_desc_failed',
        message: 'สร้างคำอธิบายไม่สำเร็จ ลองใหม่อีกครั้งครับ',
      });
    }
  };

  /** Phase 0/1: Auto-reply suggestion */
  const proAutoReplyHandler = async (req, res) => {
    const started = Date.now();
    try {
      const customerMessage = String(
        req.body?.customer_message || req.body?.message || '',
      ).trim();
      if (!customerMessage) {
        return res.status(400).json({
          success: false,
          error: 'customer_message_required',
          message: 'กรุณาใส่ข้อความลูกค้า',
        });
      }
      const out = await generateAutoReplySuggestion({
        customerMessage,
        productName: String(req.body?.product_name || ''),
        style: String(req.body?.style || 'friendly'),
        language: String(req.body?.language || 'th'),
      });
      return res.json({
        success: true,
        reply: out.reply,
        source: out.source,
        tier: req.body?.tier || null,
        metadata: { processingTime: Date.now() - started },
      });
    } catch (e) {
      console.error('POST /api/ai/pro/auto-reply:', e?.message || e);
      return res.status(e?.status || 500).json({
        success: false,
        error: e?.message || 'pro_auto_reply_failed',
        message: 'สร้างคำตอบแนะนำไม่สำเร็จ',
      });
    }
  };

  /** Phase 2: smart pricing polish */
  const proSmartPricingHandler = async (req, res) => {
    const started = Date.now();
    try {
      const out = await polishSmartPricingNote({
        title: String(req.body?.title || req.body?.product_name || ''),
        currentPrice: Number(req.body?.current_price || req.body?.currentPrice || 0),
        suggestedPrice: Number(
          req.body?.suggested_price || req.body?.suggestedPrice || 0,
        ),
        reason: String(req.body?.reason || ''),
        language: String(req.body?.language || 'th'),
      });
      return res.json({
        success: true,
        note: out.note,
        source: out.source,
        tier: req.body?.tier || null,
        metadata: { processingTime: Date.now() - started },
      });
    } catch (e) {
      console.error('POST /api/ai/pro/smart-pricing:', e?.message || e);
      return res.status(e?.status || 500).json({
        success: false,
        error: e?.message || 'pro_smart_pricing_failed',
        message: 'สร้างคำแนะนำราคาไม่สำเร็จ',
      });
    }
  };

  /** Phase 2: photo assist stub */
  const proPhotoAssistHandler = async (req, res) => {
    try {
      const out = enqueuePhotoAssistStub({
        productName: String(req.body?.product_name || req.body?.productName || ''),
        fileName: String(req.body?.file_name || req.body?.fileName || ''),
      });
      return res.json({ success: true, ...out });
    } catch (e) {
      console.error('POST /api/ai/pro/photo-assist:', e?.message || e);
      return res.status(500).json({
        success: false,
        error: e?.message || 'pro_photo_failed',
      });
    }
  };

  /** Phase 2b: AI video job create (Replicate or demo) */
  const proVideoJobHandler = async (req, res) => {
    try {
      const productName = String(
        req.body?.product_name || req.body?.productName || '',
      ).trim();
      if (!productName) {
        return res.status(400).json({
          success: false,
          error: 'product_name_required',
          message: 'ระบุชื่อสินค้าสำหรับสร้างวิดีโอ',
        });
      }
      const job = await createProVideoJob({
        productName,
        sku: String(req.body?.sku || ''),
        prompt: String(req.body?.prompt || req.body?.features || ''),
        tier: String(req.body?.tier || 'business'),
      });
      return res.json({
        success: true,
        ...publicJobView(job),
        providerDefault: resolveProVideoProvider(),
        message: job.note,
      });
    } catch (e) {
      console.error('POST /api/ai/pro/video-job:', e?.message || e);
      return res.status(500).json({
        success: false,
        error: e?.message || 'pro_video_failed',
      });
    }
  };

  /** Phase 2b: poll job status */
  const proVideoStatusHandler = async (req, res) => {
    try {
      const id = String(req.params?.id || req.query?.id || '').trim();
      if (!id) {
        return res.status(400).json({ success: false, error: 'job_id_required' });
      }
      let job = getProVideoJob(id);
      if (!job) {
        return res.status(404).json({ success: false, error: 'job_not_found' });
      }
      job = (await refreshProVideoJob(id)) || job;
      return res.json({ success: true, ...publicJobView(job) });
    } catch (e) {
      console.error('GET /api/ai/pro/video-job/:id:', e?.message || e);
      return res.status(500).json({
        success: false,
        error: e?.message || 'pro_video_status_failed',
      });
    }
  };

  /** Phase 3: Brain retrieve + reply */
  const proBrainChatHandler = async (req, res) => {
    const started = Date.now();
    try {
      const out = await replyProBrainChat({
        question: String(req.body?.question || req.body?.message || ''),
        knowledge: Array.isArray(req.body?.knowledge) ? req.body.knowledge : [],
        botName: String(req.body?.bot_name || req.body?.botName || 'Store Bot'),
        tone: String(req.body?.tone || 'friendly'),
        language: String(req.body?.language || 'th'),
      });
      return res.json({
        success: true,
        reply: out.reply,
        source: out.source,
        usedChunks: out.usedChunks,
        metadata: { processingTime: Date.now() - started },
      });
    } catch (e) {
      console.error('POST /api/ai/pro/brain/chat:', e?.message || e);
      return res.status(e?.status || 500).json({
        success: false,
        error: e?.message || 'pro_brain_failed',
      });
    }
  };

  /** Phase 3: webhook test ping */
  const proWebhookPingHandler = async (req, res) => {
    try {
      const out = await pingProWebhook({
        url: String(req.body?.url || ''),
        event: String(req.body?.event || 'pro.test'),
        payload: req.body?.payload || { hello: true },
      });
      return res.json({ success: out.ok, ...out });
    } catch (e) {
      console.error('POST /api/ai/pro/webhook/ping:', e?.message || e);
      return res.status(e?.status || 500).json({
        success: false,
        error: e?.message || 'webhook_ping_failed',
      });
    }
  };

  /** Phase 4: reviews AI reply */
  const proReviewReplyHandler = async (req, res) => {
    try {
      const out = await generateReviewReply({
        reviewBody: String(req.body?.review || req.body?.body || ''),
        rating: Number(req.body?.rating || 5),
        productName: String(req.body?.product_name || req.body?.productName || ''),
        language: String(req.body?.language || 'th'),
      });
      return res.json({ success: true, reply: out.reply, source: out.source });
    } catch (e) {
      console.error('POST /api/ai/pro/reviews/reply:', e?.message || e);
      return res.status(e?.status || 500).json({
        success: false,
        error: e?.message || 'review_reply_failed',
      });
    }
  };

  /** Phase 4: social caption polish */
  const proSocialDraftHandler = async (req, res) => {
    try {
      const out = await polishSocialPost({
        productName: String(req.body?.product_name || req.body?.productName || ''),
        platform: String(req.body?.platform || 'facebook'),
        language: String(req.body?.language || 'th'),
        highlights: String(req.body?.highlights || ''),
      });
      return res.json({ success: true, caption: out.caption, source: out.source });
    } catch (e) {
      console.error('POST /api/ai/pro/social/draft:', e?.message || e);
      return res.status(500).json({
        success: false,
        error: e?.message || 'social_draft_failed',
      });
    }
  };

  const resolveQuotaUserKey = (req) => {
    const auth = String(req.headers?.authorization || '');
    if (auth.startsWith('Bearer ') && auth.length > 20) {
      return `tok:${auth.slice(7, 40)}`;
    }
    return String(
      req.body?.user_key ||
        req.query?.user_key ||
        req.headers?.['x-pro-user-key'] ||
        'anon',
    ).slice(0, 120);
  };

  /** Phase 4: get server quota */
  const proQuotaGetHandler = async (req, res) => {
    try {
      const usage = getProQuotaForUser(resolveQuotaUserKey(req));
      return res.json({ success: true, usage });
    } catch (e) {
      return res.status(500).json({ success: false, error: e?.message || 'quota_get_failed' });
    }
  };

  /** Phase 4: sync quota (max-merge) */
  const proQuotaSyncHandler = async (req, res) => {
    try {
      const usage = syncProQuotaForUser(resolveQuotaUserKey(req), {
        descGen: req.body?.descGen ?? req.body?.desc_gen,
        video: req.body?.video,
        social: req.body?.social,
        reviews: req.body?.reviews,
      });
      return res.json({ success: true, usage });
    } catch (e) {
      return res.status(500).json({ success: false, error: e?.message || 'quota_sync_failed' });
    }
  };

  const routes = [
    ['/api/ai/orchestrator', orchestratorHandler],
    ['/api/v1/ai/orchestrator', orchestratorHandler],
    ['/api/ai/hermes/intent', hermesIntentHandler],
    ['/api/v1/ai/hermes/intent', hermesIntentHandler],
    ['/api/ai/hermes/agent', hermesIntentHandler],
    ['/api/v1/ai/hermes/agent', hermesIntentHandler],
    ['/api/ai/jarvis/concierge', jarvisHandler],
    ['/api/v1/ai/jarvis/concierge', jarvisHandler],
    ['/api/ai/qwen/polish', qwenPolishHandler],
    ['/api/v1/ai/qwen/polish', qwenPolishHandler],
    ['/api/ai/qwen/chat', qwenChatHandler],
    ['/api/v1/ai/qwen/chat', qwenChatHandler],
    ['/api/ai/pro/product-description', proDescHandler],
    ['/api/v1/ai/pro/product-description', proDescHandler],
    ['/api/ai/pro/auto-reply', proAutoReplyHandler],
    ['/api/v1/ai/pro/auto-reply', proAutoReplyHandler],
    ['/api/ai/pro/smart-pricing', proSmartPricingHandler],
    ['/api/v1/ai/pro/smart-pricing', proSmartPricingHandler],
    ['/api/ai/pro/photo-assist', proPhotoAssistHandler],
    ['/api/v1/ai/pro/photo-assist', proPhotoAssistHandler],
    ['/api/ai/pro/video-job', proVideoJobHandler],
    ['/api/v1/ai/pro/video-job', proVideoJobHandler],
    ['/api/ai/pro/brain/chat', proBrainChatHandler],
    ['/api/v1/ai/pro/brain/chat', proBrainChatHandler],
    ['/api/ai/pro/webhook/ping', proWebhookPingHandler],
    ['/api/v1/ai/pro/webhook/ping', proWebhookPingHandler],
    ['/api/ai/pro/reviews/reply', proReviewReplyHandler],
    ['/api/v1/ai/pro/reviews/reply', proReviewReplyHandler],
    ['/api/ai/pro/social/draft', proSocialDraftHandler],
    ['/api/v1/ai/pro/social/draft', proSocialDraftHandler],
    ['/api/ai/pro/quota/sync', proQuotaSyncHandler],
    ['/api/v1/ai/pro/quota/sync', proQuotaSyncHandler],
  ];

  for (const [path, handler] of routes) {
    app.post(path, auth, handler);
  }

  app.get('/api/ai/pro/video-job/:id', auth, proVideoStatusHandler);
  app.get('/api/v1/ai/pro/video-job/:id', auth, proVideoStatusHandler);
  app.get('/api/ai/pro/quota', auth, proQuotaGetHandler);
  app.get('/api/v1/ai/pro/quota', auth, proQuotaGetHandler);
}
