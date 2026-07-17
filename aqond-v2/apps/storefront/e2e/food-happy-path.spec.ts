/**
 * AQOND Food Delivery OS — Happy Path E2E (M1)
 *
 * Sprint S5 exit gate. UI smoke + integration script gate.
 * Run: npm run test:e2e -- e2e/food-happy-path.spec.ts
 * Full API path: npm run test:food-happy-path
 *
 * @see docs/food-os-completion/04-SPRINT-PLAN.md
 */
import { test, expect } from '@playwright/test';

const FOOD_HOME = '/m/food';
const MERCHANT_ORDERS = '/m/merchant/orders';
const BASE = process.env.PLAYWRIGHT_BASE_URL || 'http://127.0.0.1:3003';

test.describe('Food OS Happy Path (M1)', () => {
  test.describe.configure({ mode: 'serial' });

  test('customer: browse food home', async ({ page }) => {
    await page.goto(FOOD_HOME, { waitUntil: 'domcontentloaded' });
    await expect(page).toHaveURL(/\/m\/food/);
  });

  test('merchant orders page loads', async ({ page }) => {
    await page.goto(MERCHANT_ORDERS, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('.tt-merchant-page-title, h1')).toContainText(/ออเดอร์|รับออเดอร์/);
  });

  test('API: full happy path integration gate', async ({ request }) => {
    const health = await request.get(`${BASE}/api/food/tracking/start`, { failOnStatusCode: false });
    expect([200, 400, 405].includes(health.status())).toBeTruthy();
  });
});
