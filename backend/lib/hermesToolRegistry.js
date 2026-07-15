/**
 * Hermes Tool Registry (Phase 2 — "fill Group A") + consent + audit.
 *
 * Design contract (do not weaken):
 *  - Every tool with requiresConsent=true MUST go through propose() -> consent card -> confirm().
 *    execute() is ONLY ever called from confirmTool() after an explicit user approval.
 *  - Every propose() and every confirm() (approve OR reject) writes an audit_log entry via
 *    the shared auditService. This holds even for "just registration data, not real money" —
 *    onboarding data (phone / bank account / license) is sensitive and must be traceable.
 *
 * Zones covered: rider | merchant | partner_skill.
 * Local tools:   survey, category_pack  (write to legacy `users` via compassOnboarding).
 * Proxied tools: create_shop  -> storefront  POST /api/merchant/shops   (aqond-v2, HTTP)
 *                rider_register-> dispatch-svc POST /v1/dispatch/riders  (Go svc, HTTP)
 *                Proxied tools degrade to a "handoff" (deep-link + draft) when the target
 *                service base URL is not configured, so consent data is never silently dropped.
 */
import crypto from 'crypto';
import { createAuditService } from '../auditService.js';
import {
  submitCompassSurvey,
  saveCategoryPack,
  buildCompassStatus,
  COMPASS_GOALS,
  ACQUISITION_CHANNELS,
} from './compassOnboarding.js';

const PROPOSAL_TTL_MS = 10 * 60 * 1000; // 10 min
const PROXY_TIMEOUT_MS = Number(process.env.HERMES_TOOL_TIMEOUT_MS || 15000);

/** proposalId -> { toolId, userId, params, consent, createdAt, expiresAt } (in-memory, single instance) */
const proposals = new Map();

/** Cache one auditService per pool (createAuditService throws without a pool) */
const auditByPool = new WeakMap();
function auditFor(pool) {
  if (!pool) return { log: () => {} };
  let svc = auditByPool.get(pool);
  if (!svc) {
    svc = createAuditService(pool);
    auditByPool.set(pool, svc);
  }
  return svc;
}

function cleanupProposals() {
  const now = Date.now();
  for (const [id, p] of proposals) {
    if (p.expiresAt <= now) proposals.delete(id);
  }
}

// Value-mask only true account/number fields (NOT flags like bank_book / bank_verified).
const MASK_FIELD_RE = /account|บัญชี|_no$|number|iban/i;
// Broader flag → shows a 🔒 on the card (document-ish), value not necessarily masked.
const SENSITIVE_FIELD_RE = /bank|account|บัญชี|license|บัตร|id_card|passport/i;

/** Mask an account/number so it is safe to show on a consent card and store in audit. */
function maskAccount(v) {
  const s = String(v || '').replace(/\s+/g, '');
  if (!s) return '';
  if (s.length <= 4) return `••${s.slice(-2)}`;
  return `••••${s.slice(-4)}`;
}

async function proxyPost(url, body, token) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = /^bearer /i.test(token) ? token : `Bearer ${token}`;
  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(PROXY_TIMEOUT_MS),
  });
  let data = null;
  try {
    data = await res.json();
  } catch {
    /* non-JSON */
  }
  return { ok: res.ok, status: res.status, data };
}

function handoff(openPath, message, draft) {
  return { ok: true, mode: 'handoff', open_path: openPath, message, draft: draft || null };
}

// ----------------------------------------------------------------------------
// Tool definitions
// ----------------------------------------------------------------------------

const TOOLS = {
  survey: {
    id: 'survey',
    zone: 'any',
    label: 'บันทึกเป้าหมาย (แบบสอบถาม Compass)',
    requiresConsent: true,
    /** @returns normalized params; throws {status,message} when invalid */
    validate(params = {}) {
      const channel = String(params.acquisition_channel || '').trim().toLowerCase();
      if (!ACQUISITION_CHANNELS.has(channel)) {
        throw Object.assign(new Error('acquisition_channel ไม่ถูกต้อง'), { status: 400 });
      }
      const goals = (Array.isArray(params.user_goals) ? params.user_goals : []).filter((g) =>
        COMPASS_GOALS.has(String(g)),
      );
      if (goals.length === 0) {
        throw Object.assign(new Error('ต้องเลือกเป้าหมายอย่างน้อย 1 ข้อ'), { status: 400 });
      }
      return {
        acquisition_channel: channel,
        user_goals: goals,
        primary_intent: params.primary_intent ? String(params.primary_intent) : undefined,
      };
    },
    summarize(params) {
      return [
        { label: 'รู้จัก AQOND จาก', value: params.acquisition_channel },
        { label: 'เป้าหมาย', value: (params.user_goals || []).join(', ') },
        ...(params.primary_intent
          ? [{ label: 'ประเภทหลัก', value: params.primary_intent }]
          : []),
      ];
    },
    auditParams(params) {
      return params;
    },
    async execute(pool, ctx, params) {
      const status = await submitCompassSurvey(pool, String(ctx.userId), params);
      return {
        ok: true,
        mode: 'submitted',
        result: { primaryIntent: status.primaryIntent, zone: status.zone },
        message: 'บันทึกเป้าหมายเรียบร้อยครับ — เริ่มขั้นตอนสมัครได้เลย',
        open_path: status?.nextAction?.href || '/compass',
      };
    },
  },

  category_pack: {
    id: 'category_pack',
    zone: 'rider|partner_skill',
    label: 'บันทึกเอกสารอาชีพ (Category Pack)',
    requiresConsent: true,
    validate(params = {}) {
      const intent = String(params.intent || '').trim();
      const fields =
        params.fields && typeof params.fields === 'object' ? { ...params.fields } : null;
      if (!intent) throw Object.assign(new Error('ต้องระบุ intent'), { status: 400 });
      if (!fields || Object.keys(fields).length === 0) {
        throw Object.assign(new Error('ไม่มีข้อมูลเอกสารให้บันทึก'), { status: 400 });
      }
      return { intent, fields };
    },
    summarize(params) {
      return Object.entries(params.fields || {}).map(([k, v]) => ({
        label: k,
        value: MASK_FIELD_RE.test(k) ? maskAccount(v) : String(v),
        sensitive: SENSITIVE_FIELD_RE.test(k),
      }));
    },
    auditParams(params) {
      const fields = {};
      for (const [k, v] of Object.entries(params.fields || {})) {
        fields[k] = MASK_FIELD_RE.test(k) ? maskAccount(v) : v;
      }
      return { intent: params.intent, fields };
    },
    async execute(pool, ctx, params) {
      await saveCategoryPack(pool, String(ctx.userId), params.intent, params.fields);
      return {
        ok: true,
        mode: 'submitted',
        message: 'บันทึกเอกสารอาชีพเรียบร้อยครับ',
        open_path: '/compass',
      };
    },
  },

  create_shop: {
    id: 'create_shop',
    zone: 'merchant',
    label: 'สร้างร้านค้า',
    requiresConsent: true,
    validate(params = {}) {
      const name = String(params.name || '').trim();
      if (!name) throw Object.assign(new Error('กรุณาระบุชื่อร้าน'), { status: 400 });
      if (name.length > 80) throw Object.assign(new Error('ชื่อร้านยาวเกินไป'), { status: 400 });
      const type = params.type === 'food' ? 'food' : 'marketplace';
      return { name, type };
    },
    summarize(params) {
      return [
        { label: 'ชื่อร้าน', value: params.name },
        { label: 'ประเภท', value: params.type === 'food' ? 'ร้านอาหาร' : 'ร้านค้าทั่วไป' },
      ];
    },
    auditParams(params) {
      return params;
    },
    async execute(pool, ctx, params) {
      const base = (process.env.STOREFRONT_API_URL || process.env.STOREFRONT_URL || '').replace(
        /\/$/,
        '',
      );
      if (!base) {
        return handoff(
          '/m/merchant/shops',
          `เปิดหน้าเปิดร้านเพื่อยืนยันสร้างร้าน “${params.name}” ครับ`,
          params,
        );
      }
      try {
        const r = await proxyPost(
          `${base}/api/merchant/shops`,
          { owner_id: String(ctx.userId), action: 'create', name: params.name, type: params.type },
          ctx.token,
        );
        if (r.ok && r.data && !r.data.error) {
          return {
            ok: true,
            mode: 'submitted',
            result: r.data.shop || r.data,
            message: `ส่งคำขอเปิดร้าน “${params.name}” แล้ว รอแอดมินอนุมัติครับ`,
            open_path: '/m/merchant',
          };
        }
        return handoff(
          '/m/merchant/shops',
          `ยังส่งคำขออัตโนมัติไม่ได้ (${r.data?.error || r.status}) — เปิดหน้าเปิดร้านเพื่อยืนยันด้วยตัวเองครับ`,
          params,
        );
      } catch (e) {
        return handoff(
          '/m/merchant/shops',
          'เชื่อมต่อระบบร้านค้าไม่ได้ชั่วคราว — เปิดหน้าเปิดร้านเพื่อยืนยันด้วยตัวเองครับ',
          params,
        );
      }
    },
  },

  rider_register: {
    id: 'rider_register',
    zone: 'rider',
    label: 'สมัครเป็นไรเดอร์',
    requiresConsent: true,
    validate(params = {}) {
      const vehicleAllowed = new Set(['motorcycle', 'car', 'bicycle', 'truck']);
      const vehicle = vehicleAllowed.has(String(params.vehicle))
        ? String(params.vehicle)
        : 'motorcycle';
      return {
        display_name: String(params.display_name || '').trim() || undefined,
        phone: String(params.phone || '').trim() || undefined,
        vehicle,
        plate: String(params.plate || '').trim() || undefined,
        bank_account: String(params.bank_account || '').trim() || undefined,
      };
    },
    summarize(params) {
      const rows = [
        { label: 'ชื่อที่แสดง', value: params.display_name || '(ใช้ชื่อในโปรไฟล์)' },
        { label: 'เบอร์ติดต่อ', value: params.phone || '(ใช้เบอร์ในโปรไฟล์)' },
        { label: 'ยานพาหนะ', value: params.vehicle },
      ];
      if (params.plate) rows.push({ label: 'ทะเบียนรถ', value: params.plate });
      if (params.bank_account) {
        rows.push({ label: 'บัญชีรับเงิน', value: maskAccount(params.bank_account), sensitive: true });
      }
      return rows;
    },
    auditParams(params) {
      return { ...params, bank_account: params.bank_account ? maskAccount(params.bank_account) : undefined };
    },
    async execute(pool, ctx, params) {
      const base = (process.env.DISPATCH_SVC_URL || process.env.DISPATCH_API_URL || '').replace(
        /\/$/,
        '',
      );
      if (!base) {
        return handoff('/compass', 'เปิดหน้าสมัครไรเดอร์เพื่อยืนยันข้อมูลครับ', params);
      }
      try {
        const r = await proxyPost(
          `${base}/v1/dispatch/riders`,
          {
            user_id: String(ctx.userId),
            display_name: params.display_name || '',
            phone: params.phone || '',
            vehicle: params.vehicle,
            plate: params.plate || '',
            bank_account: params.bank_account || '',
          },
          ctx.token,
        );
        if (r.ok && r.data?.rider_id) {
          return {
            ok: true,
            mode: 'submitted',
            result: { rider_id: r.data.rider_id, kyc_status: r.data.kyc_status },
            message: 'สมัครไรเดอร์แล้วครับ — รอแอดมินอนุมัติ จากนั้นเริ่มรับงานได้เลย',
            open_path: '/compass',
          };
        }
        if (r.status === 409) {
          return {
            ok: true,
            mode: 'noop',
            message: 'บัญชีนี้มีโปรไฟล์ไรเดอร์อยู่แล้วครับ',
            open_path: '/compass',
          };
        }
        return handoff('/compass', 'ยังสมัครอัตโนมัติไม่ได้ — เปิดหน้าสมัครไรเดอร์เพื่อยืนยันครับ', params);
      } catch (e) {
        return handoff('/compass', 'เชื่อมต่อระบบไรเดอร์ไม่ได้ชั่วคราว — เปิดหน้าสมัครเพื่อยืนยันครับ', params);
      }
    },
  },
};

export function getTool(toolId) {
  return TOOLS[String(toolId)] || null;
}

export function listTools() {
  return Object.values(TOOLS).map((t) => ({
    id: t.id,
    zone: t.zone,
    label: t.label,
    requiresConsent: t.requiresConsent,
  }));
}

/**
 * Build a consent proposal (does NOT execute). Always audits action HERMES_TOOL_PROPOSED.
 * @returns {{ proposalId, toolId, zone, requiresConsent, title, summary, warning, confirmLabel, cancelLabel, expiresAt }}
 */
export function proposeTool(pool, { toolId, userId, params, actorRole = 'User', ipAddress = null }) {
  cleanupProposals();
  const tool = getTool(toolId);
  if (!tool) throw Object.assign(new Error('unknown tool'), { status: 404 });
  if (!userId) throw Object.assign(new Error('userId required'), { status: 401 });

  const normalized = tool.validate(params || {});
  const proposalId = `prop_${crypto.randomBytes(12).toString('hex')}`;
  const now = Date.now();
  const consent = {
    proposalId,
    toolId: tool.id,
    zone: tool.zone,
    requiresConsent: tool.requiresConsent,
    title: tool.label,
    summary: tool.summarize(normalized),
    warning:
      'ข้อมูลนี้จะถูกบันทึก/ส่งเข้าระบบเมื่อคุณกด “ยืนยัน” เท่านั้น หากไม่ถูกต้องกด “ยกเลิก” ได้ครับ',
    confirmLabel: 'ยืนยันส่งข้อมูล',
    cancelLabel: 'ยกเลิก',
    expiresAt: new Date(now + PROPOSAL_TTL_MS).toISOString(),
  };

  proposals.set(proposalId, {
    toolId: tool.id,
    userId: String(userId),
    params: normalized,
    consent,
    createdAt: now,
    expiresAt: now + PROPOSAL_TTL_MS,
  });

  auditFor(pool).log(
    String(userId),
    'HERMES_TOOL_PROPOSED',
    { entityName: 'partner_onboarding', entityId: tool.id, new: tool.auditParams(normalized) },
    { actorRole, status: 'Success', ipAddress },
  );

  return consent;
}

/**
 * Confirm a proposal. decision 'approve' -> execute + audit EXECUTED/HANDOFF; 'reject' -> audit REJECTED.
 * Requires the same userId that created the proposal. Never executes without an approved decision.
 */
export async function confirmTool(
  pool,
  { proposalId, userId, decision = 'approve', token = null, actorRole = 'User', ipAddress = null },
) {
  cleanupProposals();
  const entry = proposals.get(String(proposalId));
  if (!entry) throw Object.assign(new Error('proposal not found or expired'), { status: 404 });
  if (String(userId) !== entry.userId) {
    throw Object.assign(new Error('user mismatch'), { status: 403 });
  }
  const tool = getTool(entry.toolId);
  if (!tool) throw Object.assign(new Error('unknown tool'), { status: 404 });

  // Reject / cancel — audit and drop
  if (decision !== 'approve') {
    proposals.delete(entry.consent.proposalId);
    auditFor(pool).log(
      entry.userId,
      'HERMES_TOOL_REJECTED',
      { entityName: 'partner_onboarding', entityId: tool.id, new: tool.auditParams(entry.params) },
      { actorRole, status: 'Success', ipAddress },
    );
    return { ok: false, decision: 'rejected', toolId: tool.id, message: 'ยกเลิกแล้วครับ ไม่ได้ส่งข้อมูล' };
  }

  // Approve — execute exactly once
  proposals.delete(entry.consent.proposalId);
  let out;
  try {
    out = await tool.execute(pool, { userId: entry.userId, token }, entry.params);
  } catch (e) {
    auditFor(pool).log(
      entry.userId,
      'HERMES_TOOL_FAILED',
      {
        entityName: 'partner_onboarding',
        entityId: tool.id,
        new: { error: e?.message || 'execute_failed', params: tool.auditParams(entry.params) },
      },
      { actorRole, status: 'Failed', ipAddress },
    );
    throw Object.assign(new Error(e?.message || 'tool execution failed'), { status: e?.status || 500 });
  }

  const action =
    out?.mode === 'handoff'
      ? 'HERMES_TOOL_HANDOFF'
      : out?.mode === 'noop'
        ? 'HERMES_TOOL_NOOP'
        : 'HERMES_TOOL_EXECUTED';
  auditFor(pool).log(
    entry.userId,
    action,
    {
      entityName: 'partner_onboarding',
      entityId: tool.id,
      new: { mode: out?.mode, params: tool.auditParams(entry.params), result: out?.result || null },
    },
    { actorRole, status: 'Success', ipAddress },
  );

  // Refresh onboarding progress so the client can advance the guided flow
  let progress = null;
  try {
    const status = await buildCompassStatus(pool, entry.userId);
    if (status?.found) {
      progress = {
        zone: status.zone,
        nextAction: status.nextAction,
        progress: status.progress,
        allDone: status.allDone,
      };
    }
  } catch {
    /* optional */
  }

  return {
    ok: true,
    decision: 'approved',
    toolId: tool.id,
    mode: out?.mode || 'submitted',
    message: out?.message || 'ดำเนินการเรียบร้อยครับ',
    open_path: out?.open_path || null,
    result: out?.result || null,
    progress,
  };
}

export { PROPOSAL_TTL_MS, maskAccount };
