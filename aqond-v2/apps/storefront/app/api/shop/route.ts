import { NextRequest, NextResponse } from 'next/server';
import { listMerchantCatalogProducts } from '@/lib/server/merchantCatalog';
import { getShopOps } from '@/lib/server/merchantShopOps';
import { bffGet } from '@/lib/bff';

export async function GET(req: NextRequest) {
  const shopId = req.nextUrl.searchParams.get('shop_id') || req.nextUrl.searchParams.get('merchant_id');
  if (!shopId) {
    return NextResponse.json({ error: 'shop_id required' }, { status: 400 });
  }

  const isFood = String(shopId).startsWith('food-');
  let name = shopId;
  let rating: number | undefined;

  try {
    if (isFood) {
      const food = await fetch(`${process.env.KONG_URL || 'http://127.0.0.1:8000'}/api/v1/food/v1/food/restaurants/${encodeURIComponent(shopId)}`, {
        cache: 'no-store',
        headers: { 'X-Aqond-Region': 'TH' },
      });
      if (food.ok) {
        const d = await food.json();
        name = d.name || d.restaurant?.name || name;
        rating = d.rating ?? d.restaurant?.rating;
      }
    } else {
      const home = await bffGet<any>('/v1/home');
      const hit = (home.products?.products || []).find((p: any) => p.merchant_id === shopId);
      if (hit?.merchant_name) name = hit.merchant_name;
    }
  } catch {
    /* fallback name */
  }

  if (isFood) {
    return NextResponse.json({
      shop_id: shopId,
      name,
      type: 'food',
      redirect: `/m/food/${shopId}`,
      rating,
    });
  }

  const products = await listMerchantCatalogProducts(shopId);
  const ops = await getShopOps(shopId);
  const soldSet = new Set(ops.sold_out_item_ids);

  return NextResponse.json({
    shop_id: shopId,
    name,
    type: 'marketplace',
    rating,
    products: products.map((p) => ({
      ...p,
      sold_out: soldSet.has(p.id),
    })),
  });
}
