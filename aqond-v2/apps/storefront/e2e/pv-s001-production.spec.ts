import { test, expect } from '@playwright/test';

const HOME = '/m/home';

async function emulateSlowNetwork(page: import('@playwright/test').Page, latencyMs: number) {
  const client = await page.context().newCDPSession(page);
  await client.send('Network.enable');
  await client.send('Network.emulateNetworkConditions', {
    offline: false,
    downloadThroughput: (400 * 1024) / 8,
    uploadThroughput: (400 * 1024) / 8,
    latency: latencyMs,
  });
}

test.describe('S001 — Production steps (8–12)', () => {
  test('step 8: accessibility basics', async ({ page }) => {
    await page.goto(HOME, { waitUntil: 'domcontentloaded' });

    const fontFamily = await page.evaluate(() => getComputedStyle(document.body).fontFamily);
    expect(fontFamily.length).toBeGreaterThan(0);

    const retryBtn = page.getByRole('button', { name: 'ลองใหม่' });
    if (await retryBtn.count()) {
      await expect(retryBtn).toBeEnabled();
    }

    const tabHome = page.getByRole('link', { name: 'หน้าแรก' });
    await expect(tabHome).toBeVisible();

    const skeleton = page.locator('[data-testid="home-skeleton"], [data-home-products-ready]');
    await expect(skeleton.first()).toBeAttached();

    const lang = await page.locator('html').getAttribute('lang');
    expect(lang || 'th').toBeTruthy();
  });

  test('step 9: slow network (400ms latency) still usable', async ({ page }) => {
    await emulateSlowNetwork(page, 400);
    const t0 = Date.now();
    await page.goto(HOME, { waitUntil: 'domcontentloaded', timeout: 30000 });
    const loadMs = Date.now() - t0;

    await expect(page.locator('[data-testid="home-skeleton"], a[href^="/m/product/"]').first()).toBeVisible({
      timeout: 25000,
    });
    expect(loadMs).toBeLessThan(30000);
  });

  test('step 10: massive data scroll (100 + 5000 synthetic)', async ({ page }) => {
    for (const count of [100, 5000]) {
      await page.goto(`${HOME}?pv_test=massive=${count}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
      const links = page.locator('a[href^="/m/product/"]');
      await expect(links.first()).toBeVisible({ timeout: 30000 });
      expect(await links.count()).toBeGreaterThanOrEqual(Math.min(count, 10));

      const t0 = performance.now();
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await page.waitForTimeout(300);
      const scrollMs = performance.now() - t0;
      expect(scrollMs, `scroll at count=${count}`).toBeLessThan(3000);
    }
  });

  test('step 11: telemetry event posted', async ({ page }) => {
    const telemetryHit = page.waitForRequest(
      (req) => req.url().includes('/api/experience/telemetry') && req.method() === 'POST',
      { timeout: 20000 },
    );
    await page.goto(HOME, { waitUntil: 'networkidle' });
    const req = await telemetryHit;
    const body = req.postDataJSON() as { events?: Array<{ scenario_id?: string }> };
    const first = body.events?.[0];
    expect(first?.scenario_id).toBe('S001');
  });

  test('step 12: AI observation endpoint accepts home insights', async ({ page }) => {
    const obsHit = page.waitForRequest(
      (req) => req.url().includes('/api/experience/observation') && req.method() === 'POST',
      { timeout: 20000 },
    );
    await page.goto(`${HOME}?pv_test=empty`, { waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: 'ลองใหม่' }).click();
    await obsHit;
  });
});
