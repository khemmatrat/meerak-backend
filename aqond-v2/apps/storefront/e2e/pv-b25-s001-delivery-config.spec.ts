import { test, expect } from '@playwright/test';

const CONFIG_API = '/api/delivery/v1/config';

test.describe('B2.5-S001 Delivery Core — Configuration', () => {
  test('loads Delivery Core config from API', async ({ request }) => {
    const res = await request.get(CONFIG_API);
    expect(res.ok()).toBeTruthy();

    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.core).toBe('delivery-core');
    expect(body.mission).toBe('DELIVERY-CORE');
    expect(body.scenario).toBe('B2.5-S001');
    expect(body.max_pickup_radius_km).toBe(12);
    expect(body.schema_version).toBe(2);
    expect(body.parcel_fallback_enabled).toBe(true);
    expect(body.province_count).toBe(15);
    expect(body.express_province_count).toBe(5);
    expect(body.enabled_capability_count).toBeGreaterThanOrEqual(3);
    expect(body.hot_reload?.hot_reload_supported).toBe(true);
    expect(Array.isArray(body.capabilities)).toBe(true);
    expect(Array.isArray(body.provinces)).toBe(true);

    const localDelivery = body.capabilities.find(
      (c: { id: string }) => c.id === 'local_delivery',
    );
    const expressRider = body.capabilities.find(
      (c: { id: string }) => c.id === 'express_rider',
    );
    const parcelFallback = body.capabilities.find(
      (c: { id: string }) => c.id === 'parcel_fallback',
    );

    expect(localDelivery?.enabled).toBe(true);
    expect(expressRider?.enabled).toBe(true);
    expect(parcelFallback?.enabled).toBe(true);

    const bangkok = body.provinces.find((p: { province_code: string }) => p.province_code === '10');
    const phuket = body.provinces.find((p: { province_code: string }) => p.province_code === '83');

    expect(bangkok?.express_enabled).toBe(true);
    expect(phuket?.express_enabled).toBe(false);
    expect(phuket?.parcel_fallback).toBe(true);
  });

  test('exposes Delivery Core headers', async ({ request }) => {
    const res = await request.get(CONFIG_API);
    expect(res.headers()['x-aqond-delivery-core']).toBe('delivery-core');
    expect(res.headers()['x-aqond-delivery-config-source']).toBeTruthy();
  });

  test('records B2.5-S001 telemetry on config read', async ({ request }) => {
    const res = await request.get(CONFIG_API);
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.load_ms).toBeGreaterThanOrEqual(0);
  });
});
