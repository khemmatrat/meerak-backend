import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { E2E_PRODUCT_ID } from './fixtures';
import { simulatePaysoCapture } from './helpers/paymentCapture';

const CHECKOUT = '/m/checkout';
const RESULT = '/m/checkout/payment/result';
const E2E_OWNER = 'e2e-s010-result';
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

async function fillAddress(page: import('@playwright/test').Page) {
  await page.goto(CHECKOUT, { waitUntil: 'domcontentloaded' });
  await expect(page.locator('[data-testid="checkout-page"]')).toBeVisible({ timeout: 20000 });
  await page.locator('[data-testid="checkout-address-card"]').click();
  await page.locator('[placeholder="ชื่อ-นามสกุลผู้รับ"]').fill('ทดสอบ Result');
  await page.locator('[placeholder="เบอร์โทร"]').fill('0898765432');
  await page.locator('[placeholder="ที่อยู่จัดส่ง"]').fill('99 ถนนทดสอบ PV S010');
  await page.locator('[placeholder="รหัสไปรษณีย์ 5 หลัก"]').fill('10110');
}

async function completeSuccessPayment(page: import('@playwright/test').Page, request: import('@playwright/test').APIRequestContext) {
  await fillAddress(page);
  await page.locator('[data-testid="checkout-place-cta"]').click();
  await expect(page).toHaveURL(/\/m\/checkout\/payment/, { timeout: 35000 });
  const session = await page.evaluate(() => {
    const raw = sessionStorage.getItem('aqond-m-checkout-payment');
    return raw ? JSON.parse(raw) : null;
  });
  await simulatePaysoCapture(request, {
    ref: session?.action?.payso_reference_id || session?.action?.ref,
    orderIds: session?.orderIds,
    buyerId: E2E_OWNER,
  });
  await page.locator('[data-testid="checkout-payment-confirm"]').click();
  await expect(page).toHaveURL(/\/m\/checkout\/payment\/result\?status=success/, { timeout: 35000 });
  await expect(page.locator('[data-testid="checkout-payment-result-page"]')).toBeVisible({ timeout: 15000 });
}

async function seedResultSession(
  page: import('@playwright/test').Page,
  result: { status: string; amount?: string; ref?: string; message?: string },
) {
  await page.goto('/m/home', { waitUntil: 'domcontentloaded' });
  await page.evaluate((payload) => {
    sessionStorage.setItem('aqond-m-checkout-payment-result', JSON.stringify(payload));
  }, result);
}

test.describe('S010 — Payment result', () => {
  test.beforeEach(async ({ page, request }) => {
    clearCartOwner(E2E_OWNER);
    await seedCartOwner(page);
    await seedCart(request);
  });

  test('step 1: success result shows amount ref and title', async ({ page, request }) => {
    await completeSuccessPayment(page, request);
    await expect(page.locator('[data-testid="checkout-payment-result-success"]')).toBeVisible();
    await expect(page.locator('[data-testid="checkout-payment-result-title"]')).toContainText('ชำระเงินสำเร็จ');
    await expect(page.locator('[data-testid="checkout-payment-result-amount"]')).toContainText('฿');
    await expect(page.locator('[data-testid="checkout-payment-result-ref"]')).toContainText(/Ref\. PP-/);
  });

  test('step 2: success orders CTA links to toship tab', async ({ page, request }) => {
    await completeSuccessPayment(page, request);
    await expect(page.locator('[data-testid="checkout-payment-result-orders-cta"]')).toHaveAttribute(
      'href',
      '/m/orders?tab=toship',
    );
  });

  test('step 3: success home CTA links to home', async ({ page, request }) => {
    await completeSuccessPayment(page, request);
    await expect(page.locator('[data-testid="checkout-payment-result-home-cta"]')).toHaveAttribute('href', '/m/home');
  });

  test('step 4: expired result screen', async ({ page }) => {
    await seedResultSession(page, {
      status: 'expired',
      amount: '238.00',
      ref: 'PP-EXPIRED10',
      message: 'การชำระเงินหมดอายุแล้ว',
    });
    await page.goto(`${RESULT}?status=expired`, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('[data-testid="checkout-payment-result-failed"]')).toBeVisible();
    await expect(page.locator('[data-testid="checkout-payment-result-title"]')).toContainText('ชำระเงินไม่สำเร็จ');
    await expect(page.locator('[data-testid="checkout-payment-result-orders-cta"]')).toHaveAttribute(
      'href',
      '/m/orders?tab=topay',
    );
  });

  test('step 5: failed result screen', async ({ page }) => {
    await seedResultSession(page, {
      status: 'failed',
      amount: '238.00',
      ref: 'PP-FAIL10',
      message: 'ไม่สามารถยืนยันการชำระเงินได้',
    });
    await page.goto(`${RESULT}?status=failed`, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('[data-testid="checkout-payment-result-failed"]')).toBeVisible();
    await expect(page.locator('[data-testid="checkout-payment-result-title"]')).toContainText('ไม่สำเร็จ');
  });

  test('step 6: refresh preserves success result session', async ({ page, request }) => {
    await completeSuccessPayment(page, request);
    const refBefore = await page.locator('[data-testid="checkout-payment-result-ref"]').innerText();
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page.locator('[data-testid="checkout-payment-result-success"]')).toBeVisible({ timeout: 15000 });
    await expect(page.locator('[data-testid="checkout-payment-result-ref"]')).toHaveText(refBefore);
  });

  test('step 7: missing session redirects to checkout', async ({ page }) => {
    await page.goto(RESULT, { waitUntil: 'domcontentloaded' });
    await expect(page).toHaveURL(/\/m\/checkout/, { timeout: 15000 });
  });

  test('step 8: telemetry posted for payment result', async ({ page, request }) => {
    const telemetryHit = page.waitForRequest(
      (req) => {
        if (!req.url().includes('/api/experience/telemetry') || req.method() !== 'POST') return false;
        try {
          const body = req.postDataJSON() as { events?: Array<{ scenario_id?: string; surface?: string }> };
          return body.events?.some((e) => e.scenario_id === 'S010' && e.surface === 'payment_result') ?? false;
        } catch {
          return false;
        }
      },
      { timeout: 35000 },
    );
    await completeSuccessPayment(page, request);
    const req = await telemetryHit;
    const body = req.postDataJSON() as { events?: Array<{ scenario_id?: string; surface?: string }> };
    const ev = body.events?.find((e) => e.scenario_id === 'S010' && e.surface === 'payment_result');
    expect(ev?.scenario_id).toBe('S010');
    expect(ev?.surface).toBe('payment_result');
  });
});
