import fs from 'fs/promises';
import path from 'path';
import { setItemSoldOut } from '@/lib/server/merchantShopOps';
import { upsertAffiliateLink } from '@/lib/server/studioStore';
import type { MerchantCatalogProduct } from '@/lib/server/merchantCatalog';

const MANIFEST_PATH = path.join(process.cwd(), '.data', 'listings', 'manifest.json');

async function bindListingImage(productId: string, imageUrl: string) {
  try {
    const manifest = JSON.parse(await fs.readFile(MANIFEST_PATH, 'utf8')) as Record<
      string,
      { url: string; updated_at: string }
    >;
    manifest[productId] = { url: imageUrl, updated_at: new Date().toISOString() };
    await fs.mkdir(path.dirname(MANIFEST_PATH), { recursive: true });
    await fs.writeFile(MANIFEST_PATH, JSON.stringify(manifest, null, 2));
  } catch {
    await fs.mkdir(path.dirname(MANIFEST_PATH), { recursive: true });
    await fs.writeFile(
      MANIFEST_PATH,
      JSON.stringify({ [productId]: { url: imageUrl, updated_at: new Date().toISOString() } }, null, 2),
    );
  }
}

/** ให้สินค้าที่เผยแพร่จาก Ad Studio ขึ้นรายการร้าน + หน้าแรก + Feed */
export async function syncProductToMarketplace(product: MerchantCatalogProduct) {
  if (product.image_url) {
    await bindListingImage(product.id, product.image_url);
  }

  try {
    await setItemSoldOut(product.merchant_id, product.id, false);
  } catch {
    /* best-effort */
  }

  try {
    await upsertAffiliateLink({
      creator_id: `merchant-${product.merchant_id}`,
      product_id: product.id,
      merchant_id: product.merchant_id,
      title: product.title,
      price_micro: product.price_micro,
      category: product.category,
    });
  } catch {
    /* best-effort */
  }
}
