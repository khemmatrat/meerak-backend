import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminKey } from '@/lib/server/merchantAdmin';
import { exportMarketplaceCommissionCsv } from '@/lib/server/marketplaceCommissionAdmin';

function check(req: NextRequest) {
  const key = req.headers.get('x-admin-key') || req.nextUrl.searchParams.get('admin_key');
  return verifyAdminKey(key);
}

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  if (!check(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const statusRaw = req.nextUrl.searchParams.get('status');
  const status =
    statusRaw === 'accrued' || statusRaw === 'released' ? statusRaw : null;
  const csv = await exportMarketplaceCommissionCsv({
    from: req.nextUrl.searchParams.get('from'),
    to: req.nextUrl.searchParams.get('to'),
    status,
  });
  return new NextResponse(csv, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="marketplace-commission.csv"',
    },
  });
}
