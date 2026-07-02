import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { E2E_PRODUCT_ID } from './fixtures';

const CHECKOUT = '/m/checkout';
const PAYMENT = '/m/checkout/payment';
const E2E_OWNER = 'e2e-s008-payment';
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
  await expect(page.locator('[data-testid="checkout-cart-summary"]')).toBeVisible({ timeout: 20000 });
}

async function fillAddress(page: import('@playwright/test').Page) {
  await page.locator('[data-testid="checkout-address-card"]').click();
  await page.locator('[placeholder="ชื่อ-นามสกุลผู้รับ"]').fill('ทดสอบ ชำระเงิน');
  await page.locator('[placeholder="เบอร์โทร"]').fill('0898765432');
  await page.locator('[placeholder="ที่อยู่จัดส่ง"]').fill('99 ถนนทดสอบ PV S008');
  await page.locator('[placeholder="รหัสไปรษณีย์ 5 หลัก"]').fill('10110');
}

async function ensurePromptPay(page: import('@playwright/test').Page) {
  await expect(page.locator('[data-testid="checkout-payment-selected"]')).toContainText(/พร้อมเพย์|PromptPay/i);
}

async function placeToPayment(page: import('@playwright/test').Page) {
  await openCheckout(page);
  await fillAddress(page);
  await ensurePromptPay(page);
  await page.locator('[data-testid="checkout-place-cta"]').click();
  await expect(page).toHaveURL(/\/m\/checkout\/payment/, { timeout: 35000 });
  await expect(page.locator('[data-testid="checkout-payment-page"]')).toBeVisible({ timeout: 15000 });
}

test.describe('S008 — Payment UI', () => {
  test.beforeEach(async ({ page, request }) => {
    clearCartOwner(E2E_OWNER);
    await seedCartOwner(page);
    await seedCart(request);
  });

  test('step 1: PromptPay place opens payment page with QR and amount', async ({ page }) => {
    await placeToPayment(page);
    await expect(page.locator('[data-testid="checkout-payment-qr"]')).toBeVisible();
    await expect(page.locator('[data-testid="checkout-payment-amount"]')).toContainText('฿');
    await expect(page.locator('[data-testid="checkout-payment-ref"]')).toContainText(/Reference no\. PP-/);
    await expect(page.locator('[data-testid="checkout-payment-confirm"]')).toBeEnabled();
  });

  test('step 2: countdown timer visible', async ({ page }) => {
    await placeToPayment(page);
    await expect(page.locator('[data-testid="checkout-payment-timer"]')).toBeVisible();
    const timer = await page.locator('[data-testid="checkout-payment-timer"]').innerText();
    expect(timer).toMatch(/\d{2}\s*:\s*\d{2}\s*:\s*\d{2}/);
  });

  test('step 3: session survives refresh on payment page', async ({ page }) => {
    await placeToPayment(page);
    const refBefore = await page.locator('[data-testid="checkout-payment-ref"]').innerText();
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page.locator('[data-testid="checkout-payment-page"]')).toBeVisible({ timeout: 15000 });
    await expect(page.locator('[data-testid="checkout-payment-ref"]')).toHaveText(refBefore);
  });

  test('step 4: order pending payment after PromptPay place', async ({ page, request }) => {
    await placeToPayment(page);
    const ordersRes = await request.get(`/api/orders?buyer_id=${encodeURIComponent(E2E_OWNER)}`);
    const ordersJson = await ordersRes.json();
    const pending = (ordersJson.orders || []).find(
      (o: { payment_status?: string }) => o.payment_status === 'pending' || o.payment_status === 'unpaid',
    );
    expect(pending).toBeTruthy();
    expect(pending.order_id).toMatch(/^ord-/);
  });

  test('step 5: cart cleared after place before payment', async ({ page }) => {
    await placeToPayment(page);
    const cartRes = await page.request.get(`/api/bff/v1/cart?owner_id=${E2E_OWNER}`);
    const cartJson = await cartRes.json();
    expect(cartJson.count ?? cartJson.items?.length ?? 0).toBe(0);
  });

  test('step 6: expired session routes to result', async ({ page }) => {
    await page.addInitScript(() => {
      sessionStorage.setItem(
        'aqond-m-checkout-payment',
        JSON.stringify({
          action: {
            type: 'qr',
            title: 'สแกน QR / PromptPay',
            ref: 'PP-EXPIRED1',
            amount: '238.00',
            hint: 'test',
          },
          expiresAt: Date.now() - 5000,
          orderIds: ['ord-expired-test'],
          buyerId: 'e2e-s008-payment',
        }),
      );
    });
    await page.goto(PAYMENT, { waitUntil: 'domcontentloaded' });
    await expect(page).toHaveURL(/\/m\/checkout\/payment\/result\?status=expired/, { timeout: 15000 });
  });

  test('step 7: save QR and confirm buttons present', async ({ page }) => {
    await placeToPayment(page);
    await expect(page.locator('[data-testid="checkout-payment-save-qr"]')).toBeVisible();
    await expect(page.locator('[data-testid="checkout-payment-confirm"]')).toContainText('ตกลง');
  });

  test('step 8: telemetry posted for payment UI', async ({ page }) => {
    const telemetryHit = page.waitForRequest(
      (req) => {
        if (!req.url().includes('/api/experience/telemetry') || req.method() !== 'POST') return false;
        try {
          const body = req.postDataJSON() as { events?: Array<{ scenario_id?: string; surface?: string }> };
          return body.events?.some((e) => e.scenario_id === 'S008' && e.surface === 'payment_ui') ?? false;
        } catch {
          return false;
        }
      },
      { timeout: 35000 },
    );
    await placeToPayment(page);
    const req = await telemetryHit;
    const body = req.postDataJSON() as { events?: Array<{ scenario_id?: string; surface?: string }> };
    const ev = body.events?.find((e) => e.scenario_id === 'S008' && e.surface === 'payment_ui');
    expect(ev?.scenario_id).toBe('S008');
    expect(ev?.surface).toBe('payment_ui');
  });
});
