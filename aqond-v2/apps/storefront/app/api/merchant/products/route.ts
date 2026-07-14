import { NextRequest, NextResponse } from 'next/server';
import {
  getMerchantCatalogProduct,
  listMerchantCatalogProducts,
  saveMerchantCatalogProduct,
} from '@/lib/server/merchantCatalog';
import { getShopOps } from '@/lib/server/merchantShopOps';

export async function GET(req: NextRequest) {
  const merchantId = req.nextUrl.searchParams.get('merchant_id');
  const productId = req.nextUrl.searchParams.get('product_id');
  if (!merchantId) {
    return NextResponse.json({ error: 'merchant_id required' }, { status: 400 });
  }

  if (productId) {
    const product = await getMerchantCatalogProduct(merchantId, productId);
    if (!product) return NextResponse.json({ error: 'not_found' }, { status: 404 });
    const ops = await getShopOps(merchantId);
    return NextResponse.json({
      product: { ...product, sold_out: ops.sold_out_item_ids.includes(product.id) },
    });
  }

  const products = await listMerchantCatalogProducts(merchantId);
  const ops = await getShopOps(merchantId);
  const soldSet = new Set(ops.sold_out_item_ids);
  return NextResponse.json({
    products: products.map((p) => ({
      ...p,
      sold_out: soldSet.has(p.id),
    })),
  });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const merchantId = String(body.merchant_id || body.merchantId || '');
  const title = String(body.title || '').trim();
  const priceThb = Number(body.price_thb ?? body.priceThb);

  if (!merchantId || !title) {
    return NextResponse.json({ error: 'merchant_id and title required' }, { status: 400 });
  }
  if (!Number.isFinite(priceThb) || priceThb <= 0) {
    return NextResponse.json({ error: 'price_thb invalid' }, { status: 400 });
  }

  const product = await saveMerchantCatalogProduct({
    merchantId,
    productId: body.product_id || body.productId || undefined,
    title,
    description: String(body.description || ''),
    benefits: String(body.benefits || ''),
    size_guide: body.size_guide || body.sizeGuide || undefined,
    price_thb: priceThb,
    stock: Math.max(0, Number(body.stock) || 0),
    category: String(body.category || 'general'),
    image_url: body.image_url || body.imageUrl || undefined,
    product_video_url: body.product_video_url || body.productVideoUrl || undefined,
    seo_tags: Array.isArray(body.seo_tags) ? body.seo_tags : undefined,
  });

  return NextResponse.json({ ok: true, product });
}
