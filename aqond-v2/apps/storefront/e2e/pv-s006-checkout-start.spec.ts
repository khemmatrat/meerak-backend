import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { E2E_PRODUCT_ID } from './fixtures';

const CHECKOUT = '/m/checkout';
const E2E_OWNER = 'e2e-s006-checkout';
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

test.describe('S006 — Checkout start', () => {
  test.beforeEach(async ({ page, request }) => {
    clearCartOwner(E2E_OWNER);
    await seedCartOwner(page);
    await seedCart(request);
  });

  test('step 1: cart summary shows line items and subtotal', async ({ page }) => {
    await openCheckout(page);
    await expect(page.locator('[data-testid="checkout-cart-summary"]')).toContainText('E2E PDP Video Product');
    await expect(page.locator('[data-testid="checkout-payment-summary"]')).toContainText('฿199');
  });

  test('step 2: address selection form opens', async ({ page }) => {
    await openCheckout(page);
    await page.locator('[data-testid="checkout-address-card"]').click();
    await expect(page.locator('[data-testid="checkout-address-form"]')).toBeVisible();
    await page.locator('[data-testid="checkout-address-form"] input').first().fill('ทดสอบ ผู้รับ');
    await page.locator('[placeholder="เบอร์โทร"]').fill('0812345678');
    await page.locator('[placeholder="ที่อยู่จัดส่ง"]').fill('123 ถนนทดสอบ');
    await page.locator('[placeholder="รหัสไปรษณีย์ 5 หลัก"]').fill('10110');
    await expect(page.locator('[data-testid="checkout-address-card"]')).toContainText('ทดสอบ');
  });

  test('step 3: address validation rejects invalid postal', async ({ page }) => {
    await openCheckout(page);
    await page.locator('[data-testid="checkout-address-card"]').click();
    await page.locator('[placeholder="ชื่อ-นามสกุลผู้รับ"]').fill('ทดสอบ');
    await page.locator('[placeholder="เบอร์โทร"]').fill('0812345678');
    await page.locator('[placeholder="ที่อยู่จัดส่ง"]').fill('123 ถนน');
    await page.locator('[placeholder="รหัสไปรษณีย์ 5 หลัก"]').fill('123');
    await page.getByRole('button', { name: 'บันทึกที่อยู่' }).click();
    await expect(page.locator('[data-testid="checkout-address-validation-msg"]')).toContainText('5 หลัก', {
      timeout: 10000,
    });
  });

  test('step 4: shipping options calculated with rates', async ({ page }) => {
    await openCheckout(page);
    await expect(page.locator('[data-testid="checkout-shipping-options"]')).toBeVisible({ timeout: 15000 });
    await expect(page.locator('[data-testid^="checkout-shipping-rate-"]').first()).toBeVisible({ timeout: 15000 });
    await expect(page.locator('[data-testid="checkout-payment-summary"]')).toContainText('การจัดส่ง');
  });

  test('step 5: shop coupon row available', async ({ page }) => {
    await openCheckout(page);
    await page.locator('[data-testid="checkout-coupon-shop"]').click();
    await expect(page.locator('.tt-co-pro-voucher-pick button').first()).toBeVisible({ timeout: 10000 });
  });

  test('step 6: platform coupon and promotion banners visible', async ({ page }) => {
    await openCheckout(page);
    await expect(page.locator('[data-testid="checkout-coupon-platform"]')).toBeVisible();
    await expect(page.locator('[data-testid="checkout-promotion-banners"]')).toBeVisible();
    await expect(page.locator('[data-testid="checkout-promotion-banners"]')).toContainText('VIP');
  });

  test('step 7: wallet section visible with balance', async ({ page }) => {
    await openCheckout(page);
    const wallet = page.locator('[data-testid="checkout-wallet-section"]');
    await expect(wallet).toBeVisible();
    await expect(wallet).toContainText('กระเป๋า AQOND');
    await expect(wallet).toContainText('฿');
  });

  test('step 8: payment methods section and picker', async ({ page }) => {
    await openCheckout(page);
    await expect(page.locator('[data-testid="checkout-payment-methods"]')).toBeVisible();
    await expect(page.locator('[data-testid="checkout-payment-selected"]')).toBeVisible();
    await page.locator('[data-testid="checkout-payment-selected"]').click();
    await expect(page.locator('[data-testid="checkout-payment-picker"]')).toBeVisible({ timeout: 10000 });
  });

  test('step 9: checkout CTA validates address without placing order', async ({ page }) => {
    await openCheckout(page);
    await expect(page.locator('[data-testid="checkout-place-cta"]')).toBeVisible();
    await page.locator('[data-testid="checkout-place-cta"]').click();
    await expect(page.locator('[data-testid="checkout-address-error"]')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('[data-testid="checkout-address-form"]')).toBeVisible();
  });

  test('step 10: telemetry posted for checkout start', async ({ page }) => {
    const telemetryHit = page.waitForRequest(
      (req) => {
        if (!req.url().includes('/api/experience/telemetry') || req.method() !== 'POST') return false;
        try {
          const body = req.postDataJSON() as { events?: Array<{ scenario_id?: string; surface?: string }> };
          return body.events?.some((e) => e.scenario_id === 'S006' && e.surface === 'checkout_start') ?? false;
        } catch {
          return false;
        }
      },
      { timeout: 25000 },
    );
    await openCheckout(page);
    const req = await telemetryHit;
    const body = req.postDataJSON() as { events?: Array<{ scenario_id?: string; surface?: string }> };
    const ev = body.events?.find((e) => e.scenario_id === 'S006' && e.surface === 'checkout_start');
    expect(ev?.scenario_id).toBe('S006');
    expect(ev?.surface).toBe('checkout_start');
  });
});
