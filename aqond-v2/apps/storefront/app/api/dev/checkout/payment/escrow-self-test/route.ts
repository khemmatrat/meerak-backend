import { NextResponse } from 'next/server';
import { runPaymentEscrowDuplicateWebhookSelfTest } from '@/lib/server/paymentEscrowConfirm';

export const dynamic = 'force-dynamic';

/** Dev-only — duplicate webhook capture must not double-hold (stripped from production build). */
export async function POST() {
  const result = await runPaymentEscrowDuplicateWebhookSelfTest();
  return NextResponse.json({ ok: result.pass, scenario: 'payment-escrow-duplicate-webhook', ...result });
}
