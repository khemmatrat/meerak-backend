#!/usr/bin/env node
/**
 * Seed local dev data — NO Docker / Kong / feed-svc required.
 * Writes apps/storefront/.data/studio + .data/dev/catalog.json
 *
 * Usage:
 *   node apps/storefront/scripts/seed-local-dev.mjs
 *   node apps/storefront/scripts/seed-local-dev.mjs --videos 8
 */
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const storefront = path.resolve(__dirname, '..');
const root = path.resolve(storefront, '../..');
const dataDir = path.join(storefront, '.data');
const studioDir = path.join(dataDir, 'studio');
const mediaDir = path.join(studioDir, 'media');
const devDir = path.join(dataDir, 'dev');
const fixtureMp4 = path.join(root, 'infra', 'fixtures', 'seed-demo.mp4');

const videoCount = Number(process.argv.find((a) => a.startsWith('--videos='))?.split('=')[1]
  || process.argv[process.argv.indexOf('--videos') + 1]
  || 5);

const CATALOG = [
  { id: 'prod-matcha', title: 'ชา Matcha ออร์แกนิก', price_micro: 29900, category: 'food', merchant_hint: 'm-food-1' },
  { id: 'prod-snack', title: 'ขนมกรอบรสเผ็ด', price_micro: 8900, category: 'food', merchant_hint: 'm-food-1' },
  { id: 'prod-dress', title: 'เดรสลำลองสีพาสเทล', price_micro: 45900, category: 'fashion', merchant_hint: 'm-fashion-1' },
  { id: 'prod-tee', title: 'เสื้อยืด oversize', price_micro: 19900, category: 'fashion', merchant_hint: 'm-fashion-1' },
  { id: 'prod-earbuds', title: 'หูฟัง Bluetooth 5.3', price_micro: 79900, category: 'electronics', merchant_hint: 'm-tech-1' },
  { id: 'prod-serum', title: 'เซรั่มวิตามินซี', price_micro: 34900, category: 'beauty', merchant_hint: 'm-beauty-1' },
  { id: 'prod-yoga', title: 'เสื่อโยคะ พับเก็บง่าย', price_micro: 59000, category: 'sports', merchant_hint: 'm-sport-1' },
  { id: 'prod-pillow', title: 'หมอน memory foam', price_micro: 69900, category: 'home', merchant_hint: 'm-home-1' },
];

function id(prefix) {
  return `${prefix}${Date.now().toString(36)}${crypto.randomBytes(3).toString('hex')}`;
}

function ensureFixtureMp4() {
  if (fs.existsSync(fixtureMp4) && fs.statSync(fixtureMp4).size > 5000) {
    return fixtureMp4;
  }
  fs.mkdirSync(path.dirname(fixtureMp4), { recursive: true });
  // Minimal valid ftyp — enough for <video src> in dev (not for real transcode)
  const minimal = Buffer.from(
    'AAAAIGZ0eXBpc29tAAACAGlzb21pc28yYXZjMW1wNDEAAAAIZnJlZQAAA' +
    'uBtZGF0AAAAAQAAABAAAAA=',
    'base64',
  );
  fs.writeFileSync(fixtureMp4, minimal);
  console.log(`Created minimal fixture: ${fixtureMp4} (install ffmpeg for better video)`);
  return fixtureMp4;
}

function writeJson(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8');
}

function main() {
  const srcMp4 = ensureFixtureMp4();
  fs.mkdirSync(mediaDir, { recursive: true });
  fs.mkdirSync(devDir, { recursive: true });

  writeJson(path.join(devDir, 'catalog.json'), {
    region: 'TH',
    products: CATALOG,
    updated_at: new Date().toISOString(),
  });

  writeJson(path.join(devDir, 'food.json'), {
    region: 'TH',
    updated_at: new Date().toISOString(),
    note: 'Optional override — defaults in localFood.ts if omitted',
  });

  const creatorId = 'creator-local-demo';
  const affiliateLinks = CATALOG.slice(0, 6).map((p, i) => ({
    id: `aff-local-${i + 1}`,
    creator_id: creatorId,
    product_id: p.id,
    merchant_id: p.merchant_hint,
    title: p.title,
    price_micro: p.price_micro,
    category: p.category,
    commission_bps: 500,
    synced_recsys: false,
    created_at: new Date().toISOString(),
  }));

  const mediaEntries = [];
  const posts = [];

  for (let i = 0; i < videoCount; i += 1) {
    const prod = CATALOG[i % CATALOG.length];
    const mediaId = id('med-');
    const filename = `${mediaId}.mp4`;
    fs.copyFileSync(srcMp4, path.join(mediaDir, filename));
    mediaEntries.push({
      media_id: mediaId,
      author_id: `creator-feed-${i + 1}`,
      filename,
      content_type: 'video/mp4',
      status: 'ready',
      synced_video: false,
      created_at: new Date().toISOString(),
    });
    posts.push({
      post_id: id('post-'),
      author_id: `creator-feed-${i + 1}`,
      media_id: mediaId,
      caption: `[product:${prod.id}][creator:creator-feed-${i + 1}] ${prod.title} — วิดีโอแนะนำ (local dev)`,
      product_id: prod.id,
      media_local: true,
      synced_feed: false,
      created_at: new Date().toISOString(),
    });
  }

  writeJson(path.join(studioDir, 'affiliate.json'), { links: affiliateLinks });
  writeJson(path.join(studioDir, 'media-index.json'), { media: mediaEntries });
  writeJson(path.join(studioDir, 'posts.json'), { posts });

  console.log('=== Local dev seed OK (no Docker) ===');
  console.log(`  catalog:  ${CATALOG.length} products -> .data/dev/catalog.json`);
  console.log(`  food:       delivery slice -> .data/dev/food.json + /m/food`);
  console.log(`  feed:       ${posts.length} video posts -> .data/studio/posts.json`);
  console.log(`  media:      ${mediaEntries.length} mp4 -> .data/studio/media/`);
  console.log('');
  console.log('Open: http://localhost:3003/m/feed');
}

main();
