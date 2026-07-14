import fs from 'fs/promises';
import path from 'path';
import { enrichProductsWithImages } from './listingMediaStore';

const DEV_CATALOG = path.join(process.cwd(), '.data', 'dev', 'catalog.json');
const AFFILIATE_FILE = path.join(process.cwd(), '.data', 'studio', 'affiliate.json');
const MANIFEST_PATH = path.join(process.cwd(), '.data', 'listings', 'manifest.json');

type LocalProduct = {
  id: string;
  title: string;
  price_micro: number;
  merchant_hint: string;
  category: string;
  image_url?: string;
  created_at?: string;
  source?: string;
};

/** Minimal catalog when Kong/BFF is offline (Docker down / app-only dev). */
export async function buildLocalHomePayload() {
  const byId = new Map<string, LocalProduct>();

  try {
    const dev = JSON.parse(await fs.readFile(DEV_CATALOG, 'utf8'));
    for (const p of dev.products || []) {
      if (p.status && String(p.status) !== 'published') continue;
      byId.set(p.id, {
        id: p.id,
        title: p.title || p.id,
        price_micro: p.price_micro || 19900,
        merchant_hint: p.merchant_hint || p.merchant_id || 'demo-merchant',
        category: p.category || 'general',
        image_url: p.image_url || undefined,
        created_at: p.created_at || p.updated_at || undefined,
        source: p.source || 'local-catalog',
      });
    }
  } catch {
    /* no dev catalog */
  }

  try {
    const raw = JSON.parse(await fs.readFile(AFFILIATE_FILE, 'utf8'));
    for (const l of raw.links || []) {
      if (byId.has(l.product_id)) continue;
      byId.set(l.product_id, {
        id: l.product_id,
        title: l.title || l.product_id,
        price_micro: l.price_micro || 19900,
        merchant_hint: l.merchant_id || 'demo-merchant',
        category: l.category || 'general',
        source: 'affiliate',
      });
    }
  } catch {
    /* no affiliate file */
  }

  try {
    const manifest = JSON.parse(await fs.readFile(MANIFEST_PATH, 'utf8'));
    for (const id of Object.keys(manifest)) {
      if (!byId.has(id)) {
        byId.set(id, {
          id,
          title: `สินค้า ${id.slice(-6)}`,
          price_micro: 19900,
          merchant_hint: 'demo-merchant',
          category: 'general',
        });
      }
    }
  } catch {
    /* no manifest */
  }

  const products = await enrichProductsWithImages([...byId.values()]);
  products.sort((a, b) => {
    const ta = Date.parse(String(a.created_at || '')) || 0;
    const tb = Date.parse(String(b.created_at || '')) || 0;
    return tb - ta;
  });
  return {
    products: { products },
    region: 'TH',
    source: 'local-dev',
    hint: 'App-only dev — .data/dev/catalog.json + studio',
  };
}
