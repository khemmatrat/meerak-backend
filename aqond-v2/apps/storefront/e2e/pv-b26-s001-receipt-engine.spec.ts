import { test, expect } from '@playwright/test';

const PREVIEW_API = '/api/receipt/v1/engine/preview';
const PREVIEW_PDF = '/api/receipt/v1/engine/preview.pdf';

test.describe('B2.6-S001 Receipt Core — Engine Foundation', () => {
  test('renders engine preview with metadata envelope', async ({ request }) => {
    const res = await request.get(PREVIEW_API);
    expect(res.ok()).toBeTruthy();

    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.core).toBe('receipt-core');
    expect(body.scenario).toBe('B2.6-S001');
    expect(body.receipt_core_version).toBe('1.0.0');
    expect(body.validation.ok).toBe(true);
    expect(body.validation.metadata.ok).toBe(true);
    expect(body.validation.unicode.ok).toBe(true);
    expect(body.validation.pdf.ok).toBe(true);

    const meta = body.metadata;
    expect(meta.receipt_version).toBe('1.0.0');
    expect(meta.template_id).toBe('engine-preview-v1');
    expect(meta.template_version).toBe('1.0.0');
    expect(meta.language).toBe('TH');
    expect(meta.currency).toBe('THB');
    expect(meta.timezone).toBe('Asia/Bangkok');
    expect(meta.generated_by).toBe('AQOND');
    expect(meta.environment).toBeTruthy();
  });

  test('includes Thai unicode sample without ASCII corruption', async ({ request }) => {
    const res = await request.get(PREVIEW_API);
    const body = await res.json();
    expect(body.validation.unicode.sample_thai).toBe('กรุงเทพมหานคร');
    expect(body.validation.unicode.ok).toBe(true);
  });

  test('returns valid preview PDF', async ({ request }) => {
    const res = await request.get(PREVIEW_PDF);
    expect(res.ok()).toBeTruthy();
    expect(res.headers()['content-type']).toContain('application/pdf');

    const buf = Buffer.from(await res.body());
    expect(buf.slice(0, 4).toString()).toBe('%PDF');
    expect(buf.length).toBeGreaterThan(500);
  });

  test('exposes Receipt Core header', async ({ request }) => {
    const res = await request.get(PREVIEW_API);
    expect(res.headers()['x-aqond-receipt-core']).toBe('receipt-core');
  });
});
