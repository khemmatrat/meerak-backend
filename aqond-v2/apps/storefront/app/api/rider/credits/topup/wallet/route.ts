import { NextRequest, NextResponse } from 'next/server';
import { allowLocalOrders } from '@/lib/server-env';
import { topupRiderCredit } from '@/lib/server/riderCreditLine';
import { upstreamAuthFromRequest } from '@/lib/server/upstreamAuth';
import { proxyRiderCreditTopupWallet } from '@/lib/server/riderCreditTopupProxy';

/** เติมเครดิตจากวอลเล็ตหลัก (backend) — dev fallback ฟรีเมื่อ backend ไม่พร้อม */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const auth = upstreamAuthFromRequest(req);
  const riderId = String(body.rider_id || '');
  const amountMicro = Math.round(Number(body.amount_micro || 0));

  if (!riderId || amountMicro <= 0) {
    return NextResponse.json({ error: 'rider_id and amount_micro required' }, { status: 400 });
  }

  const proxied = await proxyRiderCreditTopupWallet(auth, {
    rider_id: riderId,
    amount_micro: amountMicro,
    idempotency_key: body.idempotency_key,
  });

  if (proxied.ok) {
    return NextResponse.json(proxied.data, { status: proxied.status });
  }

  if (allowLocalOrders() && proxied.status >= 500) {
    try {
      const summary = await topupRiderCredit({
        rider_id: riderId,
        user_id: auth.userId || body.user_id || '',
        amount_micro: amountMicro,
        reason: 'Dev fallback — เติมเครดิต (backend offline)',
        actor_type: 'rider',
        actor_id: riderId,
        idempotency_key: body.idempotency_key,
      });
      return NextResponse.json({ ok: true, method: 'dev_fallback', summary, warning: 'backend_offline' });
    } catch (e: unknown) {
      return NextResponse.json(
        { error: e instanceof Error ? e.message : 'topup_failed' },
        { status: 400 },
      );
    }
  }

  return NextResponse.json(proxied.data, { status: proxied.status || 502 });
}
