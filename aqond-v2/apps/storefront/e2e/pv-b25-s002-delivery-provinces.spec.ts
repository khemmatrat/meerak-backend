import { test, expect } from '@playwright/test';

const PROVINCES_API = '/api/delivery/v1/provinces';

test.describe('B2.5-S002 Delivery Core — Province Configuration', () => {
  test('lists 15 enabled provinces from configuration', async ({ request }) => {
    const res = await request.get(PROVINCES_API);
    expect(res.ok()).toBeTruthy();

    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.scenario).toBe('B2.5-S002');
    expect(body.core).toBe('delivery-core');
    expect(body.mission).toBe('DELIVERY-CORE');
    expect(body.max_pickup_radius_km).toBe(12);
    expect(body.summary.enabled_count).toBe(15);
    expect(body.summary.total_provinces).toBe(15);
    expect(body.summary.express_enabled_count).toBe(5);
    expect(body.hot_reload?.hot_reload_supported).toBe(true);
    expect(Array.isArray(body.provinces)).toBe(true);
    expect(body.provinces.length).toBe(15);
  });

  test('supports province enable and express flags', async ({ request }) => {
    const res = await request.get(PROVINCES_API);
    const body = await res.json();

    const bangkok = body.provinces.find((p: { province_code: string }) => p.province_code === '10');
    const phuket = body.provinces.find((p: { province_code: string }) => p.province_code === '83');

    expect(bangkok?.enabled).toBe(true);
    expect(bangkok?.express_enabled).toBe(true);
    expect(phuket?.enabled).toBe(true);
    expect(phuket?.express_enabled).toBe(false);
  });

  test('resolves Hat Yai alias to Songkhla', async ({ request }) => {
    const res = await request.get(`${PROVINCES_API}?alias=Hat%20Yai`);
    expect(res.ok()).toBeTruthy();

    const body = await res.json();
    expect(body.match?.province_code).toBe('90');
    expect(body.match?.alias_en).toBe('Hat Yai');
    expect(body.match?.enabled).toBe(true);
  });

  test('exposes hot-reload headers', async ({ request }) => {
    const res = await request.get(PROVINCES_API);
    expect(res.headers()['x-aqond-delivery-hot-reload']).toBe('supported');
    expect(res.headers()['x-aqond-delivery-core']).toBe('delivery-core');
  });
});
