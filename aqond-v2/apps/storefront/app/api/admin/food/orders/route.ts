import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminKey } from '@/lib/server/merchantAdmin';
import { foodMerchantOsOrders } from '@/lib/server/foodMerchantOs';

function check(req: NextRequest) {
  const key = req.headers.get('x-admin-key') || req.nextUrl.searchParams.get('admin_key');
  return verifyAdminKey(key);
}

export async function GET(req: NextRequest) {
  if (!check(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const limit = Number(req.nextUrl.searchParams.get('limit') || 50);
  const data = await foodMerchantOsOrders(limit);
  return NextResponse.json(data);
}
