import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { E2E_PRODUCT_ID } from './fixtures';

const CHECKOUT = '/m/checkout';
const ORDERS = '/m/orders';
const E2E_OWNER = 'e2e-s007-place';
const CART_FILE = path.join(__dirname, '..', '.data', 'dev', 'carts.json');
const ORDERS_FILE = path.join(__dirname, '..', '.data', 'orders.json');

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

function countOrdersForBuyer(ownerId: string): number {
  try {
    const data = JSON.parse(fs.readFileSync(ORDERS_FILE, 'utf8')) as {
      orders?: Array<{ buyer_id?: string }>;
    };
    return (data.orders || []).filter((o) => o.buyer_id === ownerId).length;
  } catch {
    return 0;
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
  await page.locator('[placeholder="ชื่อ-นามสกุลผู้รับ"]').fill('ทดสอบ สั่งซื้อ');
  await page.locator('[placeholder="เบอร์โทร"]').fill('0898765432');
  await page.locator('[placeholder="ที่อยู่จัดส่ง"]').fill('99 ถนนทดสอบ PV');
  await page.locator('[placeholder="รหัสไปรษณีย์ 5 หลัก"]').fill('10110');
}

async function selectCod(page: import('@playwright/test').Page) {
  await page.locator('[data-testid="checkout-payment-selected"]').click();
  await expect(page.locator('[data-testid="checkout-payment-picker"]')).toBeVisible({ timeout: 10000 });
  await page.locator('[data-testid="checkout-payment-picker"] button.tt-co-pay-option').filter({ hasText: 'เก็บเงินปลายทาง' }).click();
  await page.locator('[data-testid="checkout-payment-picker"] .tt-co-pay-confirm').click();
  await expect(page.locator('[data-testid="checkout-payment-selected"]')).toContainText('เก็บเงินปลายทาง');
}

async function clickPlace(page: import('@playwright/test').Page) {
  await page.locator('[data-testid="checkout-place-cta"]').click();
}

test.describe('S007 — Place order', () => {
  test.beforeEach(async ({ page, request }) => {
    clearCartOwner(E2E_OWNER);
    await seedCartOwner(page);
    await seedCart(request);
  });

  test('step 1: COD place order shows success with order ID', async ({ page }) => {
    const stockBefore = await page.request.get(`/api/product/${E2E_PRODUCT_ID}/detail`);
    const stockJson = await stockBefore.json();
    const invBefore = stockJson.product?.stock ?? stockJson.product?.inventory;

    await openCheckout(page);
    await fillAddress(page);
    await selectCod(page);
    await clickPlace(page);

    await expect(page).toHaveURL(/\/m\/orders\?placed=/, { timeout: 30000 });
    await expect(page.locator('[data-testid="order-success-banner"]')).toBeVisible();
    const orderId = await page.locator('[data-testid="order-success-id"]').innerText();
    expect(orderId).toMatch(/^ord-/);
    await expect(page.locator(`[data-testid="order-card-${orderId}"]`)).toBeVisible({ timeout: 15000 });

    const stockAfter = await page.request.get(`/api/product/${E2E_PRODUCT_ID}/detail`);
    const afterJson = await stockAfter.json();
    const invAfter = afterJson.product?.stock ?? afterJson.product?.inventory;
    if (typeof invBefore === 'number' && typeof invAfter === 'number') {
      expect(invAfter).toBe(invBefore - 1);
    }

    const cartRes = await page.request.get(`/api/bff/v1/cart?owner_id=${E2E_OWNER}`);
    const cartJson = await cartRes.json();
    expect(cartJson.count ?? cartJson.items?.length ?? 0).toBe(0);
  });

  test('step 2: loading state while placing', async ({ page }) => {
    await openCheckout(page);
    await fillAddress(page);
    await selectCod(page);
    await page.locator('[data-testid="checkout-place-cta"]').click();
    await expect(page.locator('[data-testid="checkout-place-cta"]')).toBeDisabled({ timeout: 5000 });
    await expect(page).toHaveURL(/\/m\/orders/, { timeout: 30000 });
  });

  test('step 3: double-click creates only one order', async ({ page }) => {
    const before = countOrdersForBuyer(E2E_OWNER);
    await openCheckout(page);
    await fillAddress(page);
    await selectCod(page);
    const cta = page.locator('[data-testid="checkout-place-cta"]');
    await cta.click();
    await cta.click({ force: true });
    await expect(page).toHaveURL(/\/m\/orders\?placed=/, { timeout: 30000 });
    const after = countOrdersForBuyer(E2E_OWNER);
    expect(after - before).toBe(1);
  });

  test('step 4: payment state COD on order', async ({ page, request }) => {
    await openCheckout(page);
    await fillAddress(page);
    await selectCod(page);
    await clickPlace(page);
    await expect(page).toHaveURL(/payment=cod/, { timeout: 30000 });
    const orderId = await page.locator('[data-testid="order-success-id"]').innerText();
    const ordersRes = await request.get(`/api/orders?buyer_id=${encodeURIComponent(E2E_OWNER)}`);
    const ordersJson = await ordersRes.json();
    const hit = (ordersJson.orders || []).find((o: { order_id?: string }) => o.order_id === orderId);
    expect(hit).toBeTruthy();
    expect(hit.payment_status || hit.method).toMatch(/cod/i);
  });

  test('step 5: retry succeeds after temporary place failure', async ({ page }) => {
    let failOnce = true;
    await page.route('**/api/checkout/place', async (route) => {
      if (failOnce) {
        failOnce = false;
        await route.fulfill({
          status: 503,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'temporary', detail: 'PV retry test' }),
        });
        return;
      }
      await route.continue();
    });
    await openCheckout(page);
    await fillAddress(page);
    await selectCod(page);
    await clickPlace(page);
    await expect(page.locator('[data-testid="checkout-address-error"], .tt-co-pro-error')).toBeVisible({
      timeout: 15000,
    });
    await clickPlace(page);
    await expect(page).toHaveURL(/\/m\/orders\?placed=/, { timeout: 30000 });
  });

  test('step 6: refresh keeps order on success page', async ({ page }) => {
    await openCheckout(page);
    await fillAddress(page);
    await selectCod(page);
    await clickPlace(page);
    await expect(page.locator('[data-testid="order-success-banner"]')).toBeVisible({ timeout: 30000 });
    const orderId = await page.locator('[data-testid="order-success-id"]').innerText();
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page.locator(`[data-testid="order-card-${orderId}"]`)).toBeVisible({ timeout: 15000 });
  });

  test('step 7: back from orders does not re-place (cart stays empty)', async ({ page }) => {
    await openCheckout(page);
    await fillAddress(page);
    await selectCod(page);
    await clickPlace(page);
    await expect(page).toHaveURL(/\/m\/orders/, { timeout: 30000 });
    await page.goBack();
    await page.waitForTimeout(500);
    const cartRes = await page.request.get(`/api/bff/v1/cart?owner_id=${E2E_OWNER}`);
    const cartJson = await cartRes.json();
    expect(cartJson.count ?? cartJson.items?.length ?? 0).toBe(0);
  });

  test('step 8: telemetry posted for place order', async ({ page }) => {
    const telemetryHit = page.waitForRequest(
      (req) => {
        if (!req.url().includes('/api/experience/telemetry') || req.method() !== 'POST') return false;
        try {
          const body = req.postDataJSON() as { events?: Array<{ scenario_id?: string; surface?: string }> };
          return body.events?.some((e) => e.scenario_id === 'S007' && e.surface === 'place_order') ?? false;
        } catch {
          return false;
        }
      },
      { timeout: 35000 },
    );
    await openCheckout(page);
    await fillAddress(page);
    await selectCod(page);
    await clickPlace(page);
    await expect(page).toHaveURL(/\/m\/orders/, { timeout: 30000 });
    const req = await telemetryHit;
    const body = req.postDataJSON() as { events?: Array<{ scenario_id?: string; surface?: string }> };
    const ev = body.events?.find((e) => e.scenario_id === 'S007' && e.surface === 'place_order');
    expect(ev?.scenario_id).toBe('S007');
    expect(ev?.surface).toBe('place_order');
  });
});
