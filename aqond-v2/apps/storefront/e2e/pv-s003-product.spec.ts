import { test, expect } from '@playwright/test';
import { E2E_PRODUCT_ID } from './fixtures';

const SEARCH = '/m/search';
const QUERY = 'ครีม';
const PDP = `/m/product/${E2E_PRODUCT_ID}`;

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

test.describe('S003 — Product detail', () => {
  test('step 1: product info loads (title, price, gallery)', async ({ page }) => {
    await page.goto(PDP, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('[data-testid="pdp-gallery"]')).toBeVisible({ timeout: 20000 });
    await expect(page.locator('h1.tt-pdp-pro-title')).toBeVisible();
    await expect(page.locator('.tt-pdp-pro-price')).toBeVisible();
    await expect(page.getByText('Application error')).toHaveCount(0);
  });

  test('step 2: detail API returns product', async ({ request }) => {
    const res = await request.get(`/api/product/${E2E_PRODUCT_ID}/detail`);
    expect(res.ok()).toBeTruthy();
    const json = await res.json();
    expect(json.product?.title).toBeTruthy();
    expect(json.product?.price_micro).toBeGreaterThan(0);
  });

  test('steps 3–4: add-to-cart enabled and buy sheet opens', async ({ page }) => {
    await page.goto(PDP, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('h1.tt-pdp-pro-title')).toBeVisible({ timeout: 20000 });

    const cartBtn = page.locator('.tt-pdp-pro-bar button').filter({ hasText: 'รถเข็น' });
    await expect(cartBtn).toBeEnabled();
    await cartBtn.click();

    const sheet = page.locator('[data-testid="pdp-buy-sheet"]');
    await expect(sheet).toBeVisible();
    await expect(sheet.getByRole('button', { name: 'ใส่รถเข็น' })).toBeEnabled();
  });

  test('step 5: confirm add to cart succeeds', async ({ page }) => {
    await page.goto(PDP, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('h1.tt-pdp-pro-title')).toBeVisible({ timeout: 20000 });

    await page.locator('.tt-pdp-pro-bar button').filter({ hasText: 'รถเข็น' }).click();
    await page.locator('[data-testid="pdp-buy-sheet"]').getByRole('button', { name: 'ใส่รถเข็น' }).click();
    await expect(page.getByText('ใส่รถเข็นแล้ว ✓')).toBeVisible({ timeout: 15000 });
  });

  test('step 6: search → product journey', async ({ page }) => {
    await page.goto(`${SEARCH}?q=${encodeURIComponent(QUERY)}`, { waitUntil: 'networkidle' });
    await expect(page.locator('[data-testid="search-results"]')).toBeVisible({ timeout: 15000 });

    await page.locator('a[href^="/m/product/"]').first().click();
    await expect(page).toHaveURL(/\/m\/product\//);
    await expect(page.locator('[data-testid="pdp-gallery"]')).toBeVisible({ timeout: 20000 });
    await expect(page.locator('h1.tt-pdp-pro-title')).toBeVisible();
  });

  test('step 7: buy now opens sheet', async ({ page }) => {
    await page.goto(PDP, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('h1.tt-pdp-pro-title')).toBeVisible({ timeout: 20000 });

    await page.locator('.tt-pdp-pro-bar-buy').click();
    const sheet = page.locator('[data-testid="pdp-buy-sheet"]');
    await expect(sheet).toBeVisible();
    await expect(sheet.getByRole('button', { name: 'ซื้อเลย' })).toBeEnabled();
  });

  test('step 8: back from PDP preserves search state', async ({ page }) => {
    await page.goto(`${SEARCH}?q=${encodeURIComponent(QUERY)}`, { waitUntil: 'networkidle' });
    await page.locator('a[href^="/m/product/"]').first().click();
    await expect(page).toHaveURL(/\/m\/product\//);

    await page.goBack();
    await expect(page).toHaveURL(new RegExp('/m/search'));
    await expect(page.getByRole('textbox', { name: 'ค้นหา' })).toHaveValue(QUERY);
  });

  test('step 9: slow network PDP still usable', async ({ page }) => {
    await emulateSlowNetwork(page);
    await page.goto(PDP, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('[data-testid="pdp-gallery"]')).toBeVisible({ timeout: 60000 });
    await expect(page.locator('h1.tt-pdp-pro-title')).toBeVisible({ timeout: 60000 });
    await expect(page.locator('.tt-pdp-pro-bar button').filter({ hasText: 'รถเข็น' })).toBeEnabled({
      timeout: 60000,
    });
  });

  test('step 10: telemetry posted for product detail', async ({ page }) => {
    const telemetryHit = page.waitForRequest(
      (req) => req.url().includes('/api/experience/telemetry') && req.method() === 'POST',
      { timeout: 25000 },
    );
    await page.goto(PDP, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('h1.tt-pdp-pro-title')).toBeVisible({ timeout: 20000 });

    const req = await telemetryHit;
    const body = req.postDataJSON() as { events?: Array<{ scenario_id?: string; surface?: string }> };
    const ev = body.events?.find((e) => e.scenario_id === 'S003') || body.events?.[0];
    expect(ev?.scenario_id).toBe('S003');
    expect(ev?.surface).toBe('product');
  });
});
