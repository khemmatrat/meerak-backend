import fs from 'fs/promises';
import path from 'path';

/** Tiny valid-enough MP4 for browser video element tests (H.264 placeholder). */
export const MINIMAL_MP4 = Buffer.from(
  'AAAAIGZ0eXBpc29tAAACAGlzb21pc28yYXZjMW1wNDEAAAAYbW9vdgAAAGxtdmhkAAAAAAAAAAAAAAAAAAAAAWx0cmFrAAAAXHRraGQAAAADAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAQAAAAAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAABAAAAA8AAAACQAAAAEAAAAAAAo8bWV0YQAAACFoZGxyAAAAAAAAAABtZHRhAAAAAAAAAAAAAAAAAAAAACRkaW5mAAAAHGRyZWYAAAAAAAAAAQAAAAx1cmwgAAAAAQAAABBzdGJsAAAAsHN0c2QAAAAAAAAAAQAAAKBhdmMxAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAAAAoA8AEgAAABIAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAY//8AAAA5YXZjQwFkAB7/4QAdZ2QAHqzZgKAv+WagwMDIAAADAAgAAAMB4HixbNABAAVo6Xssi/34+AAAAAATY29scm5jBmQABgAGAAYAAAAAEHN0dHMAAAAAAAAAAAAAABBzdHNjAAAAAAAAAAAAAAAUc3RzegAAAAAAAAAAAAAAAAAAABBzdGNvAAAAAAAAAAAAAAAobXZleAAAACB0cmV4AAAAFG1laGQBAAAAAAAAAAAFS8AAACB0cmV4AAAAEG1laGQBAAAAAQAAAAAAAAs8bXZoZAAAAA==',
  'base64',
);

export const E2E_PRODUCT_ID = 'e2e-pdp-video-001';
export const E2E_PUBLISH_PRODUCT_ID = 'e2e-publish-video-001';
export const E2E_JOB_ID = 'adv-e2e00000001';
export const E2E_PUBLISH_JOB_ID = 'adv-e2e00000002';
export const E2E_MERCHANT_ID = 'e2e-merchant';

export function e2eVideoUrl(jobId: string) {
  return `/api/merchant/ad-video/files/${jobId}/output.mp4`;
}

export async function seedE2eFixtures() {
  const root = path.join(__dirname, '..');
  const dataDir = path.join(root, '.data', 'dev');
  const outBase = path.join(dataDir, 'merchant-ad-output');

  for (const jobId of [E2E_JOB_ID, E2E_PUBLISH_JOB_ID]) {
    const dir = path.join(outBase, jobId);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, 'output.mp4'), MINIMAL_MP4);
    await fs.writeFile(path.join(dir, 'shot_01.jpg'), MINIMAL_MP4);
  }

  const videoUrl = e2eVideoUrl(E2E_JOB_ID);
  const catalogPath = path.join(dataDir, 'catalog.json');
  let existing: { products: Record<string, unknown>[] } = { products: [] };
  try {
    existing = JSON.parse(await fs.readFile(catalogPath, 'utf8'));
  } catch {
    /* fresh */
  }
  const e2eProducts = [
      {
        id: E2E_PRODUCT_ID,
        merchant_id: E2E_MERCHANT_ID,
        merchant_hint: E2E_MERCHANT_ID,
        title: 'E2E PDP Video Product',
        description: 'Automated PDP video test product',
        category: 'general',
        price_micro: 19900,
        inventory: 10,
        stock: 10,
        image_url: '/e2e-fixtures/poster.svg',
        metadata: {
          product_video_url: videoUrl,
          video_url: videoUrl,
          image_url: '/e2e-fixtures/poster.svg',
          images: [{ url: '/e2e-fixtures/poster.svg', primary: true }],
        },
        status: 'published',
        source: 'e2e-test',
        created_at: new Date().toISOString(),
      },
      {
        id: E2E_PUBLISH_PRODUCT_ID,
        merchant_id: E2E_MERCHANT_ID,
        merchant_hint: E2E_MERCHANT_ID,
        title: 'E2E Publish Flow Product',
        description: 'Publish flow test — video attached after publish',
        category: 'general',
        price_micro: 29900,
        inventory: 5,
        stock: 5,
        image_url: '/e2e-fixtures/poster.svg',
        metadata: {
          image_url: '/e2e-fixtures/poster.svg',
        },
        status: 'published',
        source: 'e2e-test',
        created_at: new Date().toISOString(),
      },
    ];
  const byId = new Map<string, Record<string, unknown>>();
  for (const p of existing.products || []) {
    byId.set(String(p.id), p);
  }
  for (const p of e2eProducts) {
    byId.set(String(p.id), { ...byId.get(String(p.id)), ...p });
  }
  const catalog = { products: [...byId.values()] };
  await fs.mkdir(dataDir, { recursive: true });
  await fs.writeFile(catalogPath, JSON.stringify(catalog, null, 2));

  const now = new Date().toISOString();
  const publishJob = {
    id: E2E_PUBLISH_JOB_ID,
    merchant_id: E2E_MERCHANT_ID,
    owner_id: `merchant-${E2E_MERCHANT_ID}`,
    shop_type: 'marketplace' as const,
    product_id: E2E_PUBLISH_PRODUCT_ID,
    product_title: 'E2E Publish Flow Product',
    product_image_url: '/e2e-fixtures/poster.svg',
    brief: {
      title: 'E2E Brief',
      tagline_th: 'ทดสอบ',
      shots: [],
    },
    guide: {},
    status: 'completed' as const,
    progress_pct: 100,
    output_video_url: e2eVideoUrl(E2E_PUBLISH_JOB_ID),
    output_poster_url: `/api/merchant/ad-video/files/${E2E_PUBLISH_JOB_ID}/shot_01.jpg`,
    completed_at: now,
    created_at: now,
    week_key: '2026-W26',
    video_engine: 'kenburns-fast',
  };

  await fs.writeFile(
    path.join(dataDir, 'merchant-ad-videos.json'),
    JSON.stringify({ jobs: [publishJob] }, null, 2),
  );

  await fs.writeFile(
    path.join(dataDir, 'merchant-ad-product-links.json'),
    JSON.stringify(
      {
        links: {
          [E2E_PUBLISH_JOB_ID]: {
            product_id: E2E_PUBLISH_PRODUCT_ID,
            product_title: 'E2E Publish Flow Product',
          },
        },
      },
      null,
      2,
    ),
  );
}
