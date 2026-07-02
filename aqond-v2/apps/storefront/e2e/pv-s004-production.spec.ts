import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { E2E_PRODUCT_ID } from './fixtures';

const PDP = `/m/product/${E2E_PRODUCT_ID}`;
const CART = '/m/cart';
const HOME = '/m/home';
const E2E_OWNER = 'e2e-cart-owner-prod';
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

async function addFromPdp(page: import('@playwright/test').Page) {
  await page.goto(PDP, { waitUntil: 'domcontentloaded' });
  await expect(page.locator('h1.tt-pdp-pro-title')).toBeVisible({ timeout: 20000 });
  const t0 = Date.now();
  await page.locator('.tt-pdp-pro-bar button').filter({ hasText: 'รถเข็น' }).click();
  await page.locator('[data-testid="pdp-buy-sheet"]').getByRole('button', { name: 'ใส่รถเข็น' }).click();
  await expect(page.locator('[data-testid="cart-count-badge"]')).toBeVisible({ timeout: 3000 });
  expect(Date.now() - t0).toBeLessThan(5000);
  await expect(page.getByText('ใส่รถเข็นแล้ว ✓')).toBeVisible({ timeout: 15000 });
}

test.describe('S004 Production — Add to cart hardening', () => {
  test.beforeEach(async ({ page }) => {
    clearCartOwner(E2E_OWNER);
    await seedCartOwner(page);
  });

  test('badge persists after reload and navigation', async ({ page }) => {
    await addFromPdp(page);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page.locator('[data-testid="cart-count-badge"]')).toHaveText('1', { timeout: 15000 });

    await page.goto(HOME, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('[data-testid="tab-cart-badge"]')).toHaveText('1', { timeout: 15000 });
  });

  test('browser back keeps cart count', async ({ page }) => {
    await addFromPdp(page);
    await page.goto(HOME, { waitUntil: 'domcontentloaded' });
    await page.goto(PDP, { waitUntil: 'domcontentloaded' });
    await page.goBack();
    await expect(page.locator('[data-testid="tab-cart-badge"]')).toHaveText('1');
  });

  test('cart subtotal correct for qty 2', async ({ page }) => {
    await addFromPdp(page);
    await page.locator('.tt-pdp-pro-bar button').filter({ hasText: 'รถเข็น' }).click();
    await page.locator('[data-testid="pdp-buy-sheet"]').getByRole('button', { name: 'ใส่รถเข็น' }).click();
    await expect(page.getByText('ใส่รถเข็นแล้ว ✓')).toBeVisible();

    await page.goto(CART, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('[data-testid="cart-line-item"]').first()).toContainText('2');
    await expect(page.locator('[data-testid="cart-subtotal"]')).toContainText('฿398');
  });

  test('remove item clears cart', async ({ page }) => {
    await addFromPdp(page);
    await page.goto(CART, { waitUntil: 'domcontentloaded' });
    await page.getByTestId('cart-remove-item').click();
    await expect(page.locator('[data-testid="cart-empty-state"]')).toBeVisible({ timeout: 15000 });
    await page.goto(HOME, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('[data-testid="tab-cart-badge"]')).toHaveCount(0);
  });

  test('guest cart merge API', async ({ request }) => {
    const guest = 'e2e-guest-merge';
    const user = 'e2e-user-merge';
    clearCartOwner(guest);
    clearCartOwner(user);
    await request.post('/api/cart/items', {
      data: {
        owner_id: guest,
        product_id: E2E_PRODUCT_ID,
        title: 'E2E PDP Video Product',
        qty: 1,
        unit_price_micro: 19900,
        merchant_id: 'e2e-merchant',
      },
    });
    const merge = await request.post('/api/cart/merge', {
      data: { guest_id: guest, user_id: user },
    });
    expect(merge.ok()).toBeTruthy();
    const json = await merge.json();
    expect(json.merged_lines).toBeGreaterThan(0);
    const cart = await request.get(`/api/bff/v1/cart?owner_id=${user}`);
    const cartJson = await cart.json();
    expect(cartJson.count).toBeGreaterThan(0);
  });

  test('telemetry includes trace_id and cart_refresh', async ({ page }) => {
    const hits: Array<{ scenario_id?: string; surface?: string; meta?: { trace_id?: string } }> = [];
    page.on('request', (req) => {
      if (!req.url().includes('/api/experience/telemetry') || req.method() !== 'POST') return;
      try {
        const body = req.postDataJSON() as { events?: typeof hits };
        for (const ev of body.events || []) hits.push(ev);
      } catch {
        /* ignore */
      }
    });
    await addFromPdp(page);
    await page.goto(CART, { waitUntil: 'domcontentloaded' });
    await expect.poll(() => hits.some((h) => h.scenario_id === 'S004' && h.surface === 'cart_add')).toBeTruthy();
    await expect.poll(() => hits.some((h) => h.surface === 'cart_refresh')).toBeTruthy();
    const addEv = hits.find((h) => h.surface === 'cart_add');
    expect(addEv?.meta?.trace_id).toBeTruthy();
  });

  test('no fatal console errors on add flow', async ({ page }) => {
    const errors: string[] = [];
    const isBenign = (text: string) =>
      /favicon|404|ECONNREFUSED|experienceProxy|401|Unauthorized|access control|experience\/telemetry|experience\/observation/i.test(
        text,
      );
    page.on('console', (msg) => {
      if (msg.type() === 'error' && !isBenign(msg.text())) {
        errors.push(msg.text());
      }
    });
    page.on('pageerror', (e) => {
      if (!isBenign(e.message)) errors.push(e.message);
    });
    await addFromPdp(page);
    await page.goto(CART, { waitUntil: 'domcontentloaded' });
    expect(errors).toEqual([]);
  });
});
