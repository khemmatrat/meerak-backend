import { NextRequest, NextResponse } from 'next/server';
import { getRestaurantMenu } from '@/lib/server/localFood';
import { setBulkSoldOut } from '@/lib/server/merchantShopOps';
import { appendMerchantAudit } from '@/lib/server/merchantAudit';
import { itemIdsInCategory, MENU_CATEGORIES, type MenuCategoryId } from '@/lib/menuCategories';

export async function POST(req: NextRequest) {
  const body = await req.json();
  const merchantId = body.merchant_id;
  const categoryId = body.category_id as MenuCategoryId;
  const soldOut = !!body.sold_out;

  if (!merchantId || !categoryId) {
    return NextResponse.json({ error: 'merchant_id and category_id required' }, { status: 400 });
  }

  const menuData = await getRestaurantMenu(merchantId);
  if (!menuData) {
    return NextResponse.json({ error: 'merchant_not_found' }, { status: 404 });
  }

  const ids = itemIdsInCategory(menuData.menu, categoryId);
  if (!ids.length) {
    return NextResponse.json({ error: 'ไม่มีรายการในหมวดนี้' }, { status: 400 });
  }

  const ops = await setBulkSoldOut(merchantId, ids, soldOut);
  const catLabel = MENU_CATEGORIES.find((c) => c.id === categoryId)?.label || categoryId;
  await appendMerchantAudit({
    merchant_id: merchantId,
    actor: body.actor || 'merchant',
    action: soldOut ? 'bulk_sold_out' : 'bulk_restock',
    summary: soldOut ? `ปิดทั้งหมวด ${catLabel}` : `เปิดทั้งหมวด ${catLabel}`,
    meta: { category_id: categoryId, item_count: ids.length },
  });
  return NextResponse.json({
    ok: true,
    category_id: categoryId,
    item_count: ids.length,
    sold_out: soldOut,
    sold_out_item_ids: ops.sold_out_item_ids,
  });
}
