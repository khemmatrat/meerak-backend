import { NextRequest, NextResponse } from 'next/server';
import {
  deleteMerchantPromotion,
  listMerchantPromotions,
  upsertMerchantPromotion,
  type PromoKind,
} from '@/lib/server/merchantPromotions';
import { appendMerchantAudit } from '@/lib/server/merchantAudit';
import { upstreamAuthFromRequest } from '@/lib/server/upstreamAuth';

export async function GET(req: NextRequest) {
  const merchantId = req.nextUrl.searchParams.get('merchant_id');
  if (!merchantId) {
    return NextResponse.json({ error: 'merchant_id required' }, { status: 400 });
  }
  const promos = await listMerchantPromotions(merchantId);
  return NextResponse.json({ merchant_id: merchantId, promotions: promos });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const merchantId = body.merchant_id;
  if (!merchantId) {
    return NextResponse.json({ error: 'merchant_id required' }, { status: 400 });
  }
  const auth = upstreamAuthFromRequest(req);

  if (body.action === 'delete' && body.id) {
    await deleteMerchantPromotion(merchantId, body.id, auth);
    return NextResponse.json({ ok: true });
  }

  const kind = body.kind as PromoKind;
  if (!kind || !body.label) {
    return NextResponse.json({ error: 'kind and label required' }, { status: 400 });
  }

  const promo = await upsertMerchantPromotion(merchantId, {
    id: body.id,
    kind,
    label: body.label,
    active: body.active !== false,
    item_ids: body.item_ids,
    discount_percent: body.discount_percent,
    window_start: body.window_start,
    window_end: body.window_end,
    min_order_micro: body.min_order_micro,
    ends_at: body.ends_at,
  }, auth);

  await appendMerchantAudit({
    merchant_id: merchantId,
    actor: body.actor || 'merchant',
    action: 'promo_save',
    summary: `บันทึกโปรโมชัน: ${promo.label}`,
    meta: { promo_id: promo.id, kind: promo.kind },
  });

  return NextResponse.json({ ok: true, promotion: promo });
}
