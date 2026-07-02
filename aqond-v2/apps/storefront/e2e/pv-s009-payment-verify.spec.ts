import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { E2E_PRODUCT_ID } from './fixtures';

const CHECKOUT = '/m/checkout';
const E2E_OWNER = 'e2e-s009-verify';
const CART_FILE = path.join(__dirname, '..', '.data', 'dev', 'carts.json');

function clearCartOwner(ownerId: string) {
  try {
    const store = JSON.parse(fs.readFileSync(CART_FILE, 'utf8')) as Record<string, unknown>;
    delete store[ownerId];
    fs.mkdirSync(path.dirname(CART_FILE), { recursive: true });
    fs.writeFileSync(CART_FILE, JSON.stringify(store, null, 2));
  } catch {
    fs.mkdirSync(path.dirname(CART_FILE), { recursive: true });
    fs.writeFileSync(CART_FILE, JSON.stringify({}, null, 2));
  }
}

async function seedCartOwner(page: import('@playwright/test').Page) {
  await page.addInitScript((ownerId) => {
    localStorage.setItem('aqond-cart-owner-id', ownerId);
    sessionStorage.removeItem('aqond-shop-cart-cache');
  }, E2E_OWNER);
}

async function seedCart(request: import('@playwright/test').APIRequestContext) {
  const res = await request.post('/api/cart/items', {
    data: {
      owner_id: E2E_OWNER,
      product_id: E2E_PRODUCT_ID,
      title: 'E2E PDP Video Product',
      qty: 1,
      unit_price_micro: 19900,
      merchant_id: 'e2e-merchant',
    },
  });
  expect(res.ok()).toBeTruthy();
}

async function openCheckout(page: import('@playwright/test').Page) {
  await page.goto(CHECKOUT, { waitUntil: 'domcontentloaded' });
  await expect(page.locator('[data-testid="checkout-page"]')).toBeVisible({ timeout: 20000 });
}

async function fillAddress(page: import('@playwright/test').Page) {
  await page.locator('[data-testid="checkout-address-card"]').click();
  await page.locator('[placeholder="ชื่อ-นามสกุลผู้รับ"]').fill('ทดสอบ Verify');
  await page.locator('[placeholder="เบอร์โทร"]').fill('0898765432');
  await page.locator('[placeholder="ที่อยู่จัดส่ง"]').fill('99 ถนนทดสอบ PV S009');
  await page.locator('[placeholder="รหัสไปรษณีย์ 5 หลัก"]').fill('10110');
}

async function placeToPayment(page: import('@playwright/test').Page) {
  await openCheckout(page);
  await fillAddress(page);
  await page.locator('[data-testid="checkout-place-cta"]').click();
  await expect(page).toHaveURL(/\/m\/checkout\/payment/, { timeout: 35000 });
  await expect(page.locator('[data-testid="checkout-payment-page"]')).toBeVisible({ timeout: 15000 });
}

async function placePromptPayViaApi(request: import('@playwright/test').APIRequestContext) {
  await seedCart(request);
  const idem = `pv-s009-${Date.now()}`;
  const res = await request.post('/api/checkout/place', {
    data: {
      buyer_id: E2E_OWNER,
      merchant_id: 'e2e-merchant',
      method: 'promptpay',
      amount_micro: 19900,
      shipping_micro: 3900,
      carrier_id: 'flash-th',
      idempotency_key: idem,
      recipient: 'PV Verify',
      shipping_address: '123 Test',
      postal_code: '10110',
      phone: '0812345678',
      order_type: 'marketplace',
      items: [
        {
          product_id: E2E_PRODUCT_ID,
          title: 'E2E PDP Video Product',
          qty: 1,
          unit_price_micro: 19900,
        },
      ],
    },
  });
  expect(res.ok()).toBeTruthy();
  return res.json() as Promise<{
    order_id: string;
    payment_action?: { ref?: string; amount?: string };
    payment_status?: string;
  }>;
}

test.describe('S009 — Payment verify', () => {
  test.beforeEach(async ({ page, request }) => {
    clearCartOwner(E2E_OWNER);
    await seedCartOwner(page);
    await seedCart(request);
  });

  test('step 1: confirm verify marks order paid and shows success', async ({ page, request }) => {
    await placeToPayment(page);
    const session = await page.evaluate(() => {
      const raw = sessionStorage.getItem('aqond-m-checkout-payment');
      return raw ? JSON.parse(raw) : null;
    });
    const orderId = session?.orderIds?.[0];
    expect(orderId).toMatch(/^ord-/);

    await page.locator('[data-testid="checkout-payment-confirm"]').click();
    await expect(page).toHaveURL(/\/m\/checkout\/payment\/result\?status=success/, { timeout: 30000 });
    await expect(page.locator('[data-testid="checkout-payment-result-success"]')).toBeVisible();
    await expect(page.locator('[data-testid="checkout-payment-result-title"]')).toContainText('ชำระเงินสำเร็จ');

    const ordersRes = await request.get(`/api/orders?buyer_id=${encodeURIComponent(E2E_OWNER)}`);
    const ordersJson = await ordersRes.json();
    const hit = (ordersJson.orders || []).find((o: { order_id?: string }) => o.order_id === orderId);
    expect(hit?.payment_status).toBe('paid');
  });

  test('step 2: verify API invoked on confirm', async ({ page }) => {
    const verifyHit = page.waitForRequest(
      (req) => req.url().includes('/api/checkout/payment/verify') && req.method() === 'POST',
      { timeout: 35000 },
    );
    await placeToPayment(page);
    await page.locator('[data-testid="checkout-payment-confirm"]').click();
    const req = await verifyHit;
    const body = req.postDataJSON() as { ref?: string; order_ids?: string[]; buyer_id?: string };
    expect(body.ref).toMatch(/^PP-/);
    expect(body.order_ids?.length).toBeGreaterThan(0);
    expect(body.buyer_id).toBe(E2E_OWNER);
    await expect(page).toHaveURL(/status=success/, { timeout: 30000 });
  });

  test('step 3: idempotent re-verify returns success', async ({ request }) => {
    const placed = await placePromptPayViaApi(request);
    const ref = placed.payment_action?.ref || `PP-TEST`;
    const expires = Date.now() + 60 * 60 * 1000;

    const first = await request.post('/api/checkout/payment/verify', {
      data: {
        ref,
        order_ids: [placed.order_id],
        buyer_id: E2E_OWNER,
        expires_at: expires,
        amount: placed.payment_action?.amount || '238.00',
      },
    });
    const firstJson = await first.json();
    expect(firstJson.status).toBe('success');

    const second = await request.post('/api/checkout/payment/verify', {
      data: {
        ref,
        order_ids: [placed.order_id],
        buyer_id: E2E_OWNER,
        expires_at: expires,
        amount: placed.payment_action?.amount || '238.00',
      },
    });
    const secondJson = await second.json();
    expect(secondJson.status).toBe('success');
    expect(secondJson.duplicate).toBe(true);

    const ordersRes = await request.get(`/api/orders?buyer_id=${encodeURIComponent(E2E_OWNER)}`);
    const hit = (await ordersRes.json()).orders?.find((o: { order_id?: string }) => o.order_id === placed.order_id);
    expect(hit?.payment_status).toBe('paid');
  });

  test('step 4: expired verify returns expired status', async ({ request }) => {
    const placed = await placePromptPayViaApi(request);
    const ref = placed.payment_action?.ref || `PP-EXP`;
    const res = await request.post('/api/checkout/payment/verify', {
      data: {
        ref,
        order_ids: [placed.order_id],
        buyer_id: E2E_OWNER,
        expires_at: Date.now() - 1000,
        amount: placed.payment_action?.amount || '238.00',
      },
    });
    const json = await res.json();
    expect(json.status).toBe('expired');
  });

  test('step 5: missing ref returns wrong_type', async ({ request }) => {
    const placed = await placePromptPayViaApi(request);
    const res = await request.post('/api/checkout/payment/verify', {
      data: {
        order_ids: [placed.order_id],
        buyer_id: E2E_OWNER,
        expires_at: Date.now() + 60000,
      },
    });
    const json = await res.json();
    expect(json.status).toBe('wrong_type');
  });

  test('step 6: buyer mismatch returns failed', async ({ request }) => {
    const placed = await placePromptPayViaApi(request);
    const ref = placed.payment_action?.ref || `PP-BAD`;
    const res = await request.post('/api/checkout/payment/verify', {
      data: {
        ref,
        order_ids: [placed.order_id],
        buyer_id: 'wrong-buyer-id',
        expires_at: Date.now() + 60000,
        amount: placed.payment_action?.amount || '238.00',
      },
    });
    const json = await res.json();
    expect(json.status).toBe('failed');
  });

  test('step 7: confirm button shows verifying state', async ({ page }) => {
    await placeToPayment(page);
    await page.locator('[data-testid="checkout-payment-confirm"]').click();
    await expect(page.locator('[data-testid="checkout-payment-confirm"]')).toContainText('กำลังตรวจสอบ', {
      timeout: 5000,
    });
    await expect(page).toHaveURL(/status=success/, { timeout: 30000 });
  });

  test('step 8: telemetry posted for payment verify', async ({ page }) => {
    const telemetryHit = page.waitForRequest(
      (req) => {
        if (!req.url().includes('/api/experience/telemetry') || req.method() !== 'POST') return false;
        try {
          const body = req.postDataJSON() as { events?: Array<{ scenario_id?: string; surface?: string }> };
          return body.events?.some((e) => e.scenario_id === 'S009' && e.surface === 'payment_verify') ?? false;
        } catch {
          return false;
        }
      },
      { timeout: 35000 },
    );
    await placeToPayment(page);
    await page.locator('[data-testid="checkout-payment-confirm"]').click();
    await expect(page).toHaveURL(/status=success/, { timeout: 30000 });
    const req = await telemetryHit;
    const body = req.postDataJSON() as { events?: Array<{ scenario_id?: string; surface?: string }> };
    const ev = body.events?.find((e) => e.scenario_id === 'S009' && e.surface === 'payment_verify');
    expect(ev?.scenario_id).toBe('S009');
    expect(ev?.surface).toBe('payment_verify');
  });
});
