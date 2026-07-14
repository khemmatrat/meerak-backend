import { test, expect } from '@playwright/test';
import fs from 'fs/promises';
import path from 'path';
import {
  E2E_MERCHANT_ID,
  E2E_PUBLISH_JOB_ID,
  E2E_PUBLISH_PRODUCT_ID,
  e2eVideoUrl,
} from './fixtures';
import { gotoPdp, openPdpVideoSlide } from './helpers';

const CATALOG_PATH = path.join(__dirname, '..', '.data', 'dev', 'catalog.json');

test.describe('Publish flow — video attaches to catalog', () => {
  test('POST publish attaches product_video_url to catalog', async ({ request }) => {
    const res = await request.post('/api/merchant/ad-video/publish', {
      data: {
        job_id: E2E_PUBLISH_JOB_ID,
        merchant_id: E2E_MERCHANT_ID,
        product_id: E2E_PUBLISH_PRODUCT_ID,
        target: 'studio_only',
      },
    });
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.published).toBe(true);
    expect(body.product_id).toBe(E2E_PUBLISH_PRODUCT_ID);

    const catalog = JSON.parse(await fs.readFile(CATALOG_PATH, 'utf8'));
    const product = catalog.products.find((p: { id: string }) => p.id === E2E_PUBLISH_PRODUCT_ID);
    expect(product).toBeTruthy();
    const videoUrl =
      product.metadata?.product_video_url || product.metadata?.video_url || product.product_video_url;
    expect(String(videoUrl)).toContain('output.mp4');
  });

  test('PDP shows video after publish on mobile viewport', async ({ page, request }) => {
    const detail = await request.get(`/api/product/${E2E_PUBLISH_PRODUCT_ID}/detail`);
    expect(detail.ok()).toBeTruthy();
    const data = await detail.json();
    expect(data.video?.has_file).toBe(true);
    expect(data.video?.url).toContain(e2eVideoUrl(E2E_PUBLISH_JOB_ID));

    await gotoPdp(page, E2E_PUBLISH_PRODUCT_ID);
    const video = await openPdpVideoSlide(page);
    await expect(video).toHaveAttribute('src', /output\.mp4/);
    await expect(video).toHaveJSProperty('muted', true);
    await expect(video).toHaveJSProperty('autoplay', true);
  });
});
