import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { E2E_PRODUCT_ID } from './fixtures';

const PDP = `/m/product/${E2E_PRODUCT_ID}`;
const CART = '/m/cart';
const E2E_OWNER = 'e2e-cart-owner';
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

async function addFromPdp(page: import('@playwright/test').Page, opts?: { reload?: boolean }) {
  if (opts?.reload !== false) {
    await page.goto(PDP, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('h1.tt-pdp-pro-title')).toBeVisible({ timeout: 20000 });
  }
  const cartBtn = page.locator('.tt-pdp-pro-bar button').filter({ hasText: 'รถเข็น' });
  await cartBtn.click();
  const sheet = page.locator('[data-testid="pdp-buy-sheet"]');
  await expect(sheet).toBeVisible({ timeout: 10000 });
  await sheet.getByRole('button', { name: 'ใส่รถเข็น' }).click();
  await expect(page.getByText('ใส่รถเข็นแล้ว ✓')).toBeVisible({ timeout: 15000 });
}

async function emulateSlowNetwork(page: import('@playwright/test').Page) {
  try {
    const client = await page.context().newCDPSession(page);
    await client.send('Network.enable');
    await client.send('Network.emulateNetworkConditions', {
      offline: false,
      downloadThroughput: (400 * 1024) / 8,
      uploadThroughput: (400 * 1024) / 8,
      latency: 400,
    });
  } catch {
    await page.route('**/*', async (route) => {
      await new Promise((r) => setTimeout(r, 400));
      await route.continue();
    });
  }
}

test.describe('S004 — Add to cart', () => {
  test.beforeEach(async ({ page }) => {
    clearCartOwner(E2E_OWNER);
    await seedCartOwner(page);
  });

  test('step 1: POST cart API returns item in cart', async ({ request }) => {
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
    const json = await res.json();
    expect(json.count).toBeGreaterThan(0);
    expect(json.items?.some((it: { product_id: string }) => it.product_id === E2E_PRODUCT_ID)).toBeTruthy();
  });

  test('step 2: cart count badge updates after add', async ({ page }) => {
    await addFromPdp(page);
    const badge = page.locator('[data-testid="cart-count-badge"]');
    await expect(badge).toBeVisible();
    await expect(badge).toHaveText('1');
  });

  test('steps 3–4: cart page shows line item and count', async ({ page }) => {
    await addFromPdp(page);
    await page.goto(CART, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('[data-testid="cart-page-count"]')).toContainText('(1)', { timeout: 15000 });
    await expect(page.locator('[data-testid="cart-line-item"]').first()).toBeVisible();
    await expect(page.locator('[data-testid="cart-line-item"]').first()).toContainText('E2E PDP Video Product');
  });

  test('step 5: BFF cart GET matches local owner', async ({ request }) => {
    await request.post('/api/cart/items', {
      data: {
        owner_id: E2E_OWNER,
        product_id: E2E_PRODUCT_ID,
        title: 'E2E PDP Video Product',
        qty: 1,
        unit_price_micro: 19900,
        merchant_id: 'e2e-merchant',
      },
    });
    const res = await request.get(`/api/bff/v1/cart?owner_id=${E2E_OWNER}`);
    expect(res.ok()).toBeTruthy();
    const json = await res.json();
    expect(json.count).toBeGreaterThan(0);
  });

  test('step 6: add again increments qty on cart page', async ({ page }) => {
    await addFromPdp(page);
    await addFromPdp(page, { reload: false });
    await page.goto(CART, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('[data-testid="cart-line-item"]').first()).toContainText('฿398', { timeout: 15000 });
    await expect(page.locator('[data-testid="cart-qty-stepper"] .tt-food-qty-num')).toHaveText('2');
  });

  test('step 7: search → PDP → add journey', async ({ page }) => {
    await page.goto('/m/search?q=%E0%B8%84%E0%B8%A3%E0%B8%B5%E0%B8%A1', { waitUntil: 'networkidle' });
    await page.locator('a[href^="/m/product/"]').first().click();
    await expect(page).toHaveURL(/\/m\/product\//);
    await page.locator('.tt-pdp-pro-bar button').filter({ hasText: 'รถเข็น' }).click();
    await page.locator('[data-testid="pdp-buy-sheet"]').getByRole('button', { name: 'ใส่รถเข็น' }).click();
    await expect(page.getByText('ใส่รถเข็นแล้ว ✓')).toBeVisible({ timeout: 15000 });
    await expect(page.locator('[data-testid="cart-count-badge"]')).toBeVisible();
  });

  test('step 8: cart POST observed from PDP', async ({ page }) => {
    const cartHit = page.waitForResponse(
      (res) =>
        (res.url().includes('/api/cart/items') || res.url().includes('/api/bff/v1/cart/items')) &&
        res.request().method() === 'POST' &&
        res.ok(),
      { timeout: 20000 },
    );
    await addFromPdp(page);
    const res = await cartHit;
    const json = await res.json();
    expect(json.count).toBeGreaterThan(0);
  });

  test('step 9: slow network add still succeeds', async ({ page }) => {
    await page.goto(PDP, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('h1.tt-pdp-pro-title')).toBeVisible({ timeout: 20000 });
    await emulateSlowNetwork(page);
    await addFromPdp(page, { reload: false });
    await expect(page.locator('[data-testid="cart-count-badge"]')).toBeVisible({ timeout: 60000 });
  });

  test('step 10: telemetry posted for cart add', async ({ page }) => {
    const telemetryHit = page.waitForRequest(
      (req) => {
        if (!req.url().includes('/api/experience/telemetry') || req.method() !== 'POST') return false;
        try {
          const body = req.postDataJSON() as { events?: Array<{ scenario_id?: string; surface?: string }> };
          return body.events?.some((e) => e.scenario_id === 'S004' && e.surface === 'cart_add') ?? false;
        } catch {
          return false;
        }
      },
      { timeout: 25000 },
    );
    await addFromPdp(page);
    const req = await telemetryHit;
    const body = req.postDataJSON() as { events?: Array<{ scenario_id?: string; surface?: string }> };
    const ev = body.events?.find((e) => e.scenario_id === 'S004' && e.surface === 'cart_add');
    expect(ev?.scenario_id).toBe('S004');
    expect(ev?.surface).toBe('cart_add');
  });
});
