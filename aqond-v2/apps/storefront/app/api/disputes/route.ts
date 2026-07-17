import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import { createDisputeCase } from '@/lib/server/merchantDisputes';
import type { DisputeCategory, DisputeOrderType } from '@/lib/disputePolicy';
import { FOOD_DISPUTE_TYPES, MARKETPLACE_DISPUTE_TYPES, PHOTO_REQUIRED_CLAIMS } from '@/lib/disputePolicy';

const EVIDENCE_DIR = path.join(process.cwd(), '.data', 'dev', 'dispute-evidence');

export async function GET(req: NextRequest) {
  const customerId = req.nextUrl.searchParams.get('customer_id') || 'guest';
  const orderId = req.nextUrl.searchParams.get('order_id');
  let cases: any[] = [];
  try {
    const raw = await fs.readFile(path.join(process.cwd(), '.data', 'dev', 'merchant-disputes.json'), 'utf8');
    cases = JSON.parse(raw).cases || [];
  } catch {
    cases = [];
  }
  const mine = cases.filter((c: any) => c.customer_id === customerId && (!orderId || c.order_id === orderId));
  return NextResponse.json({ cases: mine });
}

export async function POST(req: NextRequest) {
  const contentType = req.headers.get('content-type') || '';
  let body: any;

  if (contentType.includes('multipart/form-data')) {
    const form = await req.formData();
    body = {
      order_id: form.get('order_id'),
      merchant_id: form.get('merchant_id'),
      customer_id: form.get('customer_id') || 'guest',
      order_type: form.get('order_type'),
      category: form.get('category'),
      title: form.get('title'),
      description: form.get('description'),
      order_total_micro: Number(form.get('order_total_micro') || 0),
      items: JSON.parse(String(form.get('items') || '[]')),
      evidence_file: form.get('evidence_file'),
    };
  } else {
    body = await req.json();
  }

  const orderId = String(body.order_id || '');
  const merchantId = String(body.merchant_id || '');
  const category = body.category as DisputeCategory;
  const orderType = (body.order_type === 'food' ? 'food' : 'marketplace') as DisputeOrderType;

  if (!orderId || !merchantId || !category || !body.title?.trim()) {
    return NextResponse.json({ error: 'ข้อมูลไม่ครบ' }, { status: 400 });
  }

  const allowed = orderType === 'food' ? FOOD_DISPUTE_TYPES : MARKETPLACE_DISPUTE_TYPES;
  if (!allowed.some((t) => t.id === category)) {
    return NextResponse.json({ error: 'ประเภทข้อพิพาทไม่ถูกต้อง' }, { status: 400 });
  }

  let evidenceNote = body.evidence_note?.trim() || '';
  const file = body.evidence_file;
  if (PHOTO_REQUIRED_CLAIMS.has(category as any) && !file && !body.evidence_data_url) {
    return NextResponse.json({ error: 'photo_evidence_required' }, { status: 400 });
  }
  if (file && typeof file !== 'string' && file.size > 0) {
    await fs.mkdir(EVIDENCE_DIR, { recursive: true });
    const evidenceId = `ev-${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`;
    const ext = path.extname(file.name || '.mp4') || '.mp4';
    const filename = `${evidenceId}${ext}`;
    const buf = Buffer.from(await file.arrayBuffer());
    if (buf.length > 8 * 1024 * 1024) {
      return NextResponse.json({ error: 'ไฟล์ใหญ่เกิน 8MB' }, { status: 400 });
    }
    await fs.writeFile(path.join(EVIDENCE_DIR, filename), buf);
    const meta = {
      id: evidenceId,
      original_name: file.name,
      mime: file.type,
      size: buf.length,
      stored_at: new Date().toISOString(),
    };
    await fs.writeFile(path.join(EVIDENCE_DIR, `${evidenceId}.json`), JSON.stringify(meta, null, 2));
    evidenceNote = [evidenceNote, `แนบวิดีโอ/คลิป: ${file.name} (${(buf.length / 1024 / 1024).toFixed(1)} MB)`].filter(Boolean).join(' · ');
  }

  const items = Array.isArray(body.items) ? body.items : [];
  const dispute = await createDisputeCase({
    order_id: orderId,
    merchant_id: merchantId,
    customer_id: String(body.customer_id || 'guest'),
    order_type: orderType,
    category,
    title: String(body.title).trim(),
    description: String(body.description || '').trim(),
    evidence_note: evidenceNote,
    order_total_micro: Number(body.order_total_micro) || 0,
    items: items.map((it: any) => ({
      product_id: String(it.product_id || it.item_id || 'item'),
      title: String(it.title || 'สินค้า'),
      qty: Number(it.qty) || 1,
      unit_price_micro: Number(it.unit_price_micro) || 0,
      received: it.received !== false,
    })),
  });

  // Tier 2: also file RMA with compliance-svc for return/refund workflow
  try {
    const { complianceApi } = await import('@/lib/server-env');
    await fetch(complianceApi('/v1/returns'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Aqond-Region': 'TH' },
      body: JSON.stringify({
        order_id: orderId,
        buyer_id: String(body.customer_id || 'guest'),
        merchant_id: merchantId,
        reason: `${category}: ${String(body.title).trim()}`,
        amount_micro: Number(body.order_total_micro) || 0,
        days_since_delivery: Number(body.days_since_delivery) || 3,
      }),
    });
  } catch {
    /* local dispute still recorded */
  }

  return NextResponse.json({
    ok: true,
    message: 'แจ้งปัญหาแล้ว — เงินถูกพักไว้กับแพลตฟอร์มจนกว่าจะตัดสิน',
    case: dispute,
  });
}
