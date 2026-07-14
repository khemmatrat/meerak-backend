import { NextRequest, NextResponse } from 'next/server';
import { hermesApi } from '@/lib/server-env';
import { upsertMerchantAiSession } from '@/lib/server/aiTier3Store';
import { listMerchantOrders, updateMerchantFulfillment } from '@/lib/server/merchantOrders';

const HERMES_KEY = process.env.HERMES_API_KEY || process.env.AI_CORE_API_KEY || '';

async function hermesTool(merchantId: string, tool: string, arguments_: Record<string, unknown>) {
  try {
    const res = await fetch(hermesApi('/v1/tools/call'), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Hermes-Api-Key': HERMES_KEY,
      },
      body: JSON.stringify({ merchant_id: merchantId, tool, arguments: arguments_ }),
      cache: 'no-store',
      signal: AbortSignal.timeout(3_000),
    });
    const data = await res.json().catch(() => ({}));
    return { ok: res.ok, status: res.status, data };
  } catch {
    return { ok: false, status: 503, data: { source: 'rules_fallback' } };
  }
}

async function tryOrderAction(merchantId: string, message: string) {
  const msg = message.toLowerCase();
  const orderMatch = message.match(/#?([a-f0-9-]{6,})/i);
  const orders = (await listMerchantOrders(merchantId)).orders;
  const pending = orders.filter((o) =>
    ['pending_accept', 'accepted', 'preparing'].includes(o.fulfillment_status),
  );

  if (/รับออเดอร์|accept|ยืนยันออเดอร์/.test(msg)) {
    const target = orderMatch
      ? pending.find((o) => o.order_id.includes(orderMatch[1]))
      : pending.find((o) => o.fulfillment_status === 'pending_accept');
    if (!target) {
      return { reply_th: 'ไม่พบออเดอร์รอยืนยันครับ — ลองดูที่แท็บออเดอร์', action: 'none' as const };
    }
    await updateMerchantFulfillment(target.order_id, 'accepted', { actor: 'merchant-assistant' });
    return {
      reply_th: `รับออเดอร์ #${target.order_id.slice(-8)} แล้วครับ — กดเตรียมเมื่อพร้อม`,
      action: 'accept_order' as const,
      order_id: target.order_id,
    };
  }

  if (/เตรียม|กำลังทำ|preparing/.test(msg)) {
    const target = orderMatch
      ? pending.find((o) => o.order_id.includes(orderMatch[1]))
      : pending.find((o) => o.fulfillment_status === 'accepted');
    if (!target) {
      return { reply_th: 'ไม่พบออเดอร์ที่รอเตรียมครับ', action: 'none' as const };
    }
    await updateMerchantFulfillment(target.order_id, 'preparing', { actor: 'merchant-assistant' });
    return {
      reply_th: `อัปเดตออเดอร์ #${target.order_id.slice(-8)} เป็นกำลังเตรียมแล้วครับ`,
      action: 'prepare_order' as const,
      order_id: target.order_id,
    };
  }

  if (/พร้อมส่ง|ready|เสร็จแล้ว/.test(msg)) {
    const target = orderMatch
      ? pending.find((o) => o.order_id.includes(orderMatch[1]))
      : pending.find((o) => o.fulfillment_status === 'preparing');
    if (!target) {
      return { reply_th: 'ไม่พบออเดอร์ที่รอตั้งสถานะพร้อมส่งครับ', action: 'none' as const };
    }
    await updateMerchantFulfillment(target.order_id, 'ready', { actor: 'merchant-assistant' });
    return {
      reply_th: `ออเดอร์ #${target.order_id.slice(-8)} พร้อมส่งแล้วครับ — ไรเดอร์จะมารับ`,
      action: 'ready_order' as const,
      order_id: target.order_id,
    };
  }

  if (/ออเดอร์|order|ค้าง|pending/.test(msg)) {
    const { ok, data } = await hermesTool(merchantId, 'order_lookup', {
      status: 'pending',
      limit: 5,
    });
    const list = ok ? ((data as { orders?: unknown[] }).orders || []) : pending.slice(0, 5);
    if (!list.length) {
      return { reply_th: 'ตอนนี้ไม่มีออเดอร์ค้างครับ', action: 'order_lookup' as const };
    }
    const lines = (list as Array<{ order_id?: string; id?: string; fulfillment_status?: string }>)
      .map((o) => `#${String(o.order_id || o.id).slice(-8)} (${o.fulfillment_status || 'pending'})`)
      .join(', ');
    return {
      reply_th: `ออเดอร์ค้าง ${list.length} รายการ: ${lines} — พูดว่า "รับออเดอร์" หรือ "เตรียมอาหาร" ได้ครับ`,
      action: 'order_lookup' as const,
      orders: list,
    };
  }

  return null;
}

function ruleReply(message: string, merchantId: string) {
  const msg = message.toLowerCase();
  if (/sla|ช้า|ตอบช้า|เวลา/.test(msg)) {
    return {
      reply_th: 'แนะนำตอบออเดอร์ภายใน 5 นาที และกดเตรียมทันทีเมื่อรับงาน — คะแนนร้านจะดีขึ้นครับ',
      tool: 'merchant_sla_hint',
    };
  }
  if (/โปร|โปรโมชัน|ลดราคา/.test(msg)) {
    return {
      reply_th: 'ลองสร้างโปร 10% กับเมนูขายดี หรือปักสินค้าในไลฟ์พร้อม F-Code ครับ',
      tool: 'menu_promo_hint',
    };
  }
  if (/ไลฟ์|live|สตรีม/.test(msg)) {
    return {
      reply_th: 'ช่วงไลฟ์แนะนำถาม engagement ทุก 3 นาที และปักสินค้า slot 1 เป็น F-Code หลักครับ',
      tool: 'live_consult',
    };
  }
  return {
    reply_th: `สวัสดีครับ — ผมผู้ช่วยร้าน ${merchantId} ช่วยเรื่อง SLA, โปรโมชัน, ไลฟ์ และออเดอร์ได้ครับ`,
    tool: 'none',
  };
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const merchantId = String(body.merchant_id || '').trim();
  const message = String(body.message || '').trim();
  if (!merchantId || !message) {
    return NextResponse.json({ error: 'merchant_id and message required' }, { status: 400 });
  }

  const orderAction = await tryOrderAction(merchantId, message);
  if (orderAction) {
    await upsertMerchantAiSession({
      merchant_id: merchantId,
      last_message: message,
      context: { last_action: orderAction.action, order_id: orderAction.order_id },
    });
    return NextResponse.json({
      ok: true,
      reply_th: orderAction.reply_th,
      action: orderAction.action,
      order_id: orderAction.order_id,
      orders: orderAction.orders,
      mode: 'action',
    });
  }

  const local = ruleReply(message, merchantId);
  let toolResult: unknown = null;

  if (local.tool && local.tool !== 'none') {
    const { ok, status, data } = await hermesTool(merchantId, local.tool, {
      message,
      urgent: /ด่วน|ช้า/.test(message),
    });
    if (ok) {
      toolResult = data;
      const script = (data as { script?: string }).script;
      if (script) local.reply_th = script;
    } else if (status === 401) {
      return NextResponse.json({ error: 'hermes_unauthorized' }, { status: 502 });
    }
  }

  await upsertMerchantAiSession({
    merchant_id: merchantId,
    last_message: message,
    context: { last_tool: local.tool },
  });

  return NextResponse.json({
    ok: true,
    reply_th: local.reply_th,
    tool: local.tool,
    tool_result: toolResult,
    mode: toolResult ? 'hermes' : 'rules',
  });
}

export async function GET() {
  try {
    const res = await fetch(hermesApi('/health'), { cache: 'no-store', signal: AbortSignal.timeout(3000) });
    const data = await res.json().catch(() => ({}));
    return NextResponse.json({ ok: res.ok, hermes: data });
  } catch {
    return NextResponse.json({ ok: true, hermes: null, mode: 'rules_fallback' });
  }
}
