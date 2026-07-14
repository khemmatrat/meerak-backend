import type { APIRequestContext } from '@playwright/test';
import { expect } from '@playwright/test';

/** Simulates PaySo capture for local stub intents (requires PV_E2E_PAYSO_MOCK=1 on server). */
export async function simulatePaysoCapture(
  request: APIRequestContext,
  opts: { ref: string; orderIds?: string[]; buyerId?: string },
) {
  const res = await request.post('/api/dev/checkout/payment/simulate-capture', {
    data: {
      ref: opts.ref,
      order_ids: opts.orderIds,
      buyer_id: opts.buyerId,
    },
  });
  expect(res.ok(), `simulate-capture failed: ${await res.text()}`).toBeTruthy();
  return res.json() as Promise<{ ok: boolean; ref: string; intent_id: string }>;
}

export async function simulateCaptureForPlacedOrder(
  request: APIRequestContext,
  placed: {
    order_id: string;
    payment_action?: { ref?: string; payso_reference_id?: string };
  },
  buyerId: string,
) {
  const ref = placed.payment_action?.payso_reference_id || placed.payment_action?.ref;
  expect(ref).toBeTruthy();
  await simulatePaysoCapture(request, {
    ref: ref!,
    orderIds: [placed.order_id],
    buyerId,
  });
}
