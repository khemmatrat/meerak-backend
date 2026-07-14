import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminKey } from '@/lib/server/merchantAdmin';
import { foodMerchantOsDashboard } from '@/lib/server/foodMerchantOs';

function check(req: NextRequest) {
  const key = req.headers.get('x-admin-key') || req.nextUrl.searchParams.get('admin_key');
  return verifyAdminKey(key);
}

export async function GET(req: NextRequest) {
  if (!check(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const dash = await foodMerchantOsDashboard();
  return NextResponse.json(dash);
}
