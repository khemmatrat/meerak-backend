import { expect, type Page } from '@playwright/test';

export async function gotoPdp(page: Page, productId: string) {
  const detailResponse = page.waitForResponse(
    (resp) => resp.url().includes(`/api/product/${productId}/detail`) && resp.status() === 200,
    { timeout: 30_000 },
  );
  await page.goto(`/m/product/${productId}`, { waitUntil: 'domcontentloaded' });
  const resp = await detailResponse;
  const body = await resp.json();
  expect(body.video?.has_file).toBe(true);
  await expect(page.getByTestId('pdp-gallery')).toBeVisible();
  await expect(page.getByTestId('pdp-rail-video')).toBeVisible();
  await expect(page.getByTestId('pdp-gallery-dots').locator('button')).toHaveCount(2, {
    timeout: 15_000,
  });
}

export async function openPdpVideoSlide(page: Page) {
  await page.getByTestId('pdp-gallery-dots').locator('button').last().click();
  const video = page.getByTestId('pdp-gallery-video');
  await expect(video).toBeVisible({ timeout: 15_000 });
  return video;
}
