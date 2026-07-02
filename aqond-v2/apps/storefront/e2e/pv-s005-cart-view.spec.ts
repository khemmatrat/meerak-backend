import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { E2E_PRODUCT_ID } from './fixtures';

const CART = '/m/cart';
const E2E_OWNER = 'e2e-s005-view';
const E2E_PRODUCT_B = 'e2e-s005-product-b';
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

async function seedLine(
  request: import('@playwright/test').APIRequestContext,
  productId: string,
  title: string,
  qty: number,
  unitMicro = 19900,
) {
  const res = await request.post('/api/cart/items', {
    data: {
      owner_id: E2E_OWNER,
      product_id: productId,
      title,
      qty,
      unit_price_micro: unitMicro,
      merchant_id: 'e2e-merchant',
    },
  });
  expect(res.ok()).toBeTruthy();
  return res.json();
}

test.describe('S005 — View cart', () => {
  test.beforeEach(async ({ page }) => {
    clearCartOwner(E2E_OWNER);
    await seedCartOwner(page);
  });

  test('step 1: line items match seeded cart on /m/cart', async ({ page, request }) => {
    await seedLine(request, E2E_PRODUCT_ID, 'E2E PDP Video Product', 1);
    await page.goto(CART, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('[data-testid="cart-line-item"]').first()).toBeVisible({ timeout: 15000 });
    await expect(page.locator('[data-testid="cart-line-item"]').first()).toContainText('E2E PDP Video Product');
    await expect(page.locator('[data-testid="cart-page-count"]')).toContainText('(1)');
  });

  test('step 2: subtotal totals correct', async ({ page, request }) => {
    await seedLine(request, E2E_PRODUCT_ID, 'E2E PDP Video Product', 2);
    await page.goto(CART, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('[data-testid="cart-subtotal"]')).toContainText('฿398', { timeout: 15000 });
    await expect(page.locator('[data-testid="cart-line-item"]').first()).toContainText('฿398');
  });

  test('step 3: checkout step bar visible with items', async ({ page, request }) => {
    await seedLine(request, E2E_PRODUCT_ID, 'E2E PDP Video Product', 1);
    await page.goto(CART, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('[data-testid="cart-checkout-steps"]')).toBeVisible({ timeout: 15000 });
    await expect(page.locator('[data-testid="cart-checkout-steps"]')).toContainText('รถเข็น');
  });

  test('step 4: checkout CTA links to /m/checkout', async ({ page, request }) => {
    await seedLine(request, E2E_PRODUCT_ID, 'E2E PDP Video Product', 1);
    await page.goto(CART, { waitUntil: 'domcontentloaded' });
    const cta = page.locator('[data-testid="cart-checkout-cta"]');
    await expect(cta).toBeVisible({ timeout: 15000 });
    await expect(cta).toHaveAttribute('href', '/m/checkout');
  });

  test('step 5: navigate to cart via tab bar', async ({ page, request }) => {
    await seedLine(request, E2E_PRODUCT_ID, 'E2E PDP Video Product', 1);
    await page.goto('/m/home', { waitUntil: 'domcontentloaded' });
    await page.locator('a[href="/m/cart"]').first().click();
    await expect(page).toHaveURL(/\/m\/cart/);
    await expect(page.locator('[data-testid="cart-line-item"]').first()).toBeVisible({ timeout: 15000 });
  });

  test('step 6: empty state when cart cleared', async ({ page }) => {
    await page.goto(CART, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('[data-testid="cart-empty-state"]')).toBeVisible({ timeout: 15000 });
    await expect(page.getByText('รถเข็นของคุณว่างเปล่า')).toBeVisible();
  });

  test('step 7: multi-line cart shows all items', async ({ page, request }) => {
    await seedLine(request, E2E_PRODUCT_ID, 'E2E PDP Video Product', 1);
    await seedLine(request, E2E_PRODUCT_B, 'E2E Second Line Item', 1, 9900);
    await page.goto(CART, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('[data-testid="cart-line-item"]')).toHaveCount(2, { timeout: 15000 });
    await expect(page.locator('[data-testid="cart-page-count"]')).toContainText('(2)');
    await expect(page.locator('[data-testid="cart-subtotal"]')).toContainText('฿298');
  });

  test('step 8: BFF GET totals match cart page', async ({ page, request }) => {
    const json = await seedLine(request, E2E_PRODUCT_ID, 'E2E PDP Video Product', 2);
    expect(json.total_micro).toBe(39800);
    await page.goto(CART, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('[data-testid="cart-subtotal"]')).toContainText('฿398', { timeout: 15000 });
  });

  test('step 9: qty stepper updates subtotal on view', async ({ page, request }) => {
    await seedLine(request, E2E_PRODUCT_ID, 'E2E PDP Video Product', 1);
    await page.goto(CART, { waitUntil: 'domcontentloaded' });
    await page.locator('[data-testid="cart-qty-stepper"] button[aria-label="เพิ่มจำนวน"]').click();
    await expect(page.locator('[data-testid="cart-subtotal"]')).toContainText('฿398', { timeout: 15000 });
    await expect(page.locator('[data-testid="cart-page-count"]')).toContainText('(2)');
  });

  test('step 10: telemetry posted for cart view', async ({ page, request }) => {
    const telemetryHit = page.waitForRequest(
      (req) => {
        if (!req.url().includes('/api/experience/telemetry') || req.method() !== 'POST') return false;
        try {
          const body = req.postDataJSON() as { events?: Array<{ scenario_id?: string; surface?: string }> };
          return body.events?.some((e) => e.scenario_id === 'S005' && e.surface === 'cart_view') ?? false;
        } catch {
          return false;
        }
      },
      { timeout: 25000 },
    );
    await seedLine(request, E2E_PRODUCT_ID, 'E2E PDP Video Product', 1);
    await page.goto(CART, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('[data-testid="cart-line-item"]').first()).toBeVisible({ timeout: 15000 });
    const req = await telemetryHit;
    const body = req.postDataJSON() as { events?: Array<{ scenario_id?: string; surface?: string }> };
    const ev = body.events?.find((e) => e.scenario_id === 'S005' && e.surface === 'cart_view');
    expect(ev?.scenario_id).toBe('S005');
    expect(ev?.surface).toBe('cart_view');
  });
});
