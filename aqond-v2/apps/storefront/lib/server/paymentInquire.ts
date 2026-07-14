import { kongBase } from '@/lib/server-env';
import {
  findLocalPaymentIntent,
  isLocalDevIntentId,
  type LocalPaymentIntent,
} from '@/lib/server/localPaymentIntentStore';

export type PaymentInquireResult = {
  paid: boolean;
  pending?: boolean;
  error?: string;
  source?: 'payment-svc' | 'local-intent';
  payso_status?: string;
  intent_id?: string;
  provider_ref?: string;
};

type KongInquireResponse = {
  paid?: boolean;
  status?: string;
  payso_status?: string;
  intent_id?: string;
  provider_ref?: string;
  error?: string;
};

async function inquireViaPaymentSvc(intentId: string): Promise<PaymentInquireResult> {
  try {
    const res = await fetch(
      `${kongBase()}/api/v1/payment/v1/intents/inquire?id=${encodeURIComponent(intentId)}`,
      { cache: 'no-store', headers: { 'X-Aqond-Region': 'TH' } },
    );
    const data = (await res.json().catch(() => ({}))) as KongInquireResponse;
    if (!res.ok) {
      return {
        paid: false,
        error: data.error || `inquire_http_${res.status}`,
        source: 'payment-svc',
      };
    }
    const status = String(data.status || data.payso_status || '').toLowerCase();
    const paid = Boolean(data.paid) || status === 'captured';
    return {
      paid,
      pending: !paid && (status === 'authorized' || status === 'pending'),
      error: paid ? undefined : data.error,
      source: 'payment-svc',
      payso_status: data.payso_status || status,
      intent_id: data.intent_id || intentId,
      provider_ref: data.provider_ref,
    };
  } catch (e: unknown) {
    return {
      paid: false,
      error: e instanceof Error ? e.message : 'inquire_unreachable',
      source: 'payment-svc',
    };
  }
}

function localIntentPaid(intent: LocalPaymentIntent): PaymentInquireResult {
  const paid = intent.status === 'captured';
  return {
    paid,
    pending: intent.status === 'pending',
    source: 'local-intent',
    intent_id: intent.intent_id,
    provider_ref: intent.payso_reference_id,
    payso_status: intent.status,
    error: paid ? undefined : 'payment_not_captured',
  };
}

/** Server-side payment confirmation — never trust client-declared paid status. */
export async function inquireMarketplacePayment(opts: {
  intentId?: string;
  paysoReferenceId?: string;
}): Promise<PaymentInquireResult> {
  const intentId = opts.intentId?.trim();
  const paysoRef = opts.paysoReferenceId?.trim();

  if (intentId && isLocalDevIntentId(intentId)) {
    const local = await findLocalPaymentIntent({ intentId, paysoReferenceId: paysoRef });
    if (local) return localIntentPaid(local);
    return { paid: false, error: 'local_intent_not_found', source: 'local-intent' };
  }

  if (intentId) {
    const remote = await inquireViaPaymentSvc(intentId);
    if (remote.paid || remote.pending || !remote.error?.includes('intent_not_found')) {
      return remote;
    }
  }

  if (paysoRef) {
    const local = await findLocalPaymentIntent({ paysoReferenceId: paysoRef, intentId });
    if (local) return localIntentPaid(local);
  }

  if (intentId) {
    return inquireViaPaymentSvc(intentId);
  }

  return {
    paid: false,
    error: paysoRef ? 'payment_not_captured' : 'missing_payment_reference',
  };
}
