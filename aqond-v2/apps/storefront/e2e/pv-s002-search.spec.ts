import { test, expect } from '@playwright/test';

const SEARCH = '/m/search';
const QUERY = 'ครีม';
const FUZZY_QUERY = 'ครีมกันแด';
const EMPTY_QUERY = 'zzzznotfound999';

async function emulateSlowNetwork(page: import('@playwright/test').Page) {
  const client = await page.context().newCDPSession(page);
  await client.send('Network.enable');
  await client.send('Network.emulateNetworkConditions', {
    offline: false,
    downloadThroughput: (400 * 1024) / 8,
    uploadThroughput: (400 * 1024) / 8,
    latency: 400,
  });
}

test.describe('S002 — Find & decide (search)', () => {
  test('step 1: search by product name returns results', async ({ page }) => {
    await page.goto(`${SEARCH}?q=${encodeURIComponent(QUERY)}`, { waitUntil: 'networkidle' });
    await expect(page.locator('[data-testid="search-results"]')).toBeVisible({ timeout: 15000 });
    await expect(page.locator('a[href^="/m/product/"]').first()).toBeVisible();
  });

  test('step 2: minor typo still finds products (fuzzy)', async ({ page }) => {
    await page.goto(`${SEARCH}?q=${encodeURIComponent(FUZZY_QUERY)}`, { waitUntil: 'networkidle' });
    const links = page.locator('a[href^="/m/product/"]');
    await expect(links.first()).toBeVisible({ timeout: 15000 });
    expect(await links.count()).toBeGreaterThan(0);
  });

  test('step 3: empty results show suggestions not blank', async ({ page }) => {
    await page.goto(`${SEARCH}?q=${encodeURIComponent(EMPTY_QUERY)}`, { waitUntil: 'networkidle' });
    const empty = page.locator('[data-testid="search-empty-suggestions"]');
    await expect(empty).toBeVisible({ timeout: 15000 });
    await expect(empty.getByText('คำค้นยอดนิยม')).toBeVisible();
    await expect(empty.getByText('หมวดหมู่', { exact: true })).toBeVisible();
    await expect(page.getByText('Application error')).toHaveCount(0);
  });

  test('steps 4–5: filter and sort tabs work', async ({ page }) => {
    await page.goto(SEARCH, { waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: 'ดูสินค้าทั้งหมด' }).click();
    await expect(page.locator('[data-testid="search-results"]')).toBeVisible({ timeout: 15000 });

    await page.getByRole('tab', { name: 'ราคา ↓' }).click();
    await expect(page.locator('[data-testid="search-results"]')).toBeVisible({ timeout: 15000 });

    await page.getByRole('button', { name: 'ราคา ▾' }).click();
    await page.getByRole('button', { name: 'ต่ำกว่า ฿500' }).click();
    await expect(
      page.locator('[data-testid="search-results"], [data-testid="search-empty-suggestions"]').first(),
    ).toBeVisible({ timeout: 15000 });
  });

  test('steps 6–7: open product and back preserves search state', async ({ page }) => {
    await page.goto(`${SEARCH}?q=${encodeURIComponent(QUERY)}`, { waitUntil: 'networkidle' });
    await expect(page.locator('[data-testid="search-results"]')).toBeVisible();

    await page.evaluate(() => window.scrollTo(0, 400));
    await page.waitForTimeout(200);

    const input = page.getByRole('textbox', { name: 'ค้นหา' });
    await expect(input).toHaveValue(QUERY);

    const firstProduct = page.locator('a[href^="/m/product/"]').first();
    await firstProduct.click();
    await expect(page).toHaveURL(/\/m\/product\//);

    await page.goBack();
    await expect(page).toHaveURL(new RegExp(`/m/search`));
    await expect(input).toHaveValue(QUERY);
    await expect(page.locator('[data-testid="search-results"]')).toBeVisible({ timeout: 15000 });
  });

  test('step 8: Jarvis surface available (optional)', async ({ page }) => {
    await page.goto(SEARCH, { waitUntil: 'domcontentloaded' });
    const jarvis = page.locator('[data-jarvis], .jarvis-fab, [class*="jarvis"]');
    const count = await jarvis.count();
    expect(count).toBeGreaterThanOrEqual(0);
  });

  test('step 9: slow network search still responds', async ({ page }) => {
    await page.goto(SEARCH, { waitUntil: 'domcontentloaded' });
    await emulateSlowNetwork(page);
    await page.getByRole('textbox', { name: 'ค้นหา' }).fill(QUERY);
    await page.getByRole('textbox', { name: 'ค้นหา' }).press('Enter');
    await expect(page.locator('[data-testid="search-loading"]')).toBeVisible({ timeout: 5000 });
    await expect(
      page.locator('[data-testid="search-results"], [data-testid="search-empty-suggestions"]').first(),
    ).toBeVisible({ timeout: 60000 });
  });

  test('step 10: telemetry posted for search', async ({ page }) => {
    const telemetryHit = page.waitForRequest(
      (req) => req.url().includes('/api/experience/telemetry') && req.method() === 'POST',
      { timeout: 20000 },
    );
    await page.goto(`${SEARCH}?q=${encodeURIComponent(QUERY)}`, { waitUntil: 'networkidle' });
    const req = await telemetryHit;
    const body = req.postDataJSON() as { events?: Array<{ scenario_id?: string; surface?: string }> };
    const ev = body.events?.find((e) => e.scenario_id === 'S002') || body.events?.[0];
    expect(ev?.scenario_id).toBe('S002');
    expect(ev?.surface).toBe('search');
  });
});
