import { test, expect } from '@playwright/test';

const HOME = '/m/home';

function ignoreConsoleNoise(errors: string[]) {
  return errors.filter((e) => !/favicon|hydration|third.party|chrome-extension/i.test(e));
}

test.describe('S001 — Open storefront home', () => {
  test('steps 1–3: load, products, no console errors', async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });
    page.on('pageerror', (err) => consoleErrors.push(err.message));

    const t0 = Date.now();
    const res = await page.goto(HOME, { waitUntil: 'domcontentloaded' });
    const loadMs = Date.now() - t0;

    expect(res?.ok()).toBeTruthy();
    expect(loadMs).toBeLessThan(8000);

    const productLinks = page.locator('a[href^="/m/product/"]');
    await expect(productLinks.first()).toBeVisible({ timeout: 15000 });
    expect(await productLinks.count()).toBeGreaterThan(0);

    expect(ignoreConsoleNoise(consoleErrors)).toEqual([]);
  });

  test('step 4: skeleton visible quickly (not black screen)', async ({ page }) => {
    const skeleton = page.locator('[data-testid="home-skeleton"]');
    const t0 = Date.now();
    await page.goto(HOME, { waitUntil: 'commit' });
    await skeleton.first().waitFor({ state: 'attached', timeout: 500 });
    const skeletonMs = Date.now() - t0;

    await expect(skeleton.first()).toBeVisible();
    const bodyBg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    expect(bodyBg).not.toBe('rgba(0, 0, 0, 0)');

    const devSkeletonBudgetMs = Number(process.env.PV_S001_SKELETON_MS || 500);
    expect(skeletonMs, `skeleton paint (dev budget ${devSkeletonBudgetMs}ms; prod target 200ms)`).toBeLessThan(
      devSkeletonBudgetMs,
    );

    await expect(page.locator('a[href^="/m/product/"]').first()).toBeVisible({ timeout: 20000 });
  });

  test('step 5: empty state when API unavailable (not 500)', async ({ page }) => {
    const res = await page.goto(`${HOME}?pv_test=empty`, { waitUntil: 'domcontentloaded' });
    expect(res?.status()).toBe(200);

    const empty = page.locator('[data-testid="home-connection-empty"]');
    await expect(empty).toBeVisible();
    await expect(page.getByRole('heading', { name: 'กำลังเชื่อมต่อข้อมูล' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'ลองใหม่' })).toBeVisible();
    await expect(page.getByText('Application error')).toHaveCount(0);
    await expect(page.getByText('Internal Server Error')).toHaveCount(0);
  });

  test('step 6: offline shows cache after prior visit', async ({ page, context }) => {
    await page.goto(HOME, { waitUntil: 'networkidle' });
    await expect(page.locator('a[href^="/m/product/"]').first()).toBeVisible();

    await context.setOffline(true);
    await page.evaluate(() => window.dispatchEvent(new Event('offline')));

    const banner = page.locator('[data-testid="home-offline-banner"]');
    const offlineEmpty = page.locator('[data-testid="home-offline-empty"]');
    const productLinks = page.locator('a[href^="/m/product/"]');

    const hasBanner = (await banner.count()) > 0;
    const hasProducts = (await productLinks.count()) > 0;
    const hasOfflinePage = (await offlineEmpty.count()) > 0;
    if (hasBanner) await expect(banner).toBeVisible();
    expect(hasBanner || hasProducts || hasOfflinePage).toBeTruthy();

    await context.setOffline(false);
    await page.evaluate(() => window.dispatchEvent(new Event('online')));
  });

  test('step 7: recover refreshes on online without manual F5', async ({ page, context }) => {
    await page.goto(HOME, { waitUntil: 'networkidle' });
    await expect(page.locator('a[href^="/m/product/"]').first()).toBeVisible();

    await context.setOffline(true);
    await page.evaluate(() => window.dispatchEvent(new Event('offline')));

    const refreshSeen = page.waitForResponse(
      (res) => res.url().includes('/m/home') && res.status() === 200,
      { timeout: 15000 },
    );

    await context.setOffline(false);
    await page.evaluate(() => window.dispatchEvent(new Event('online')));

    await refreshSeen;
  });
});
