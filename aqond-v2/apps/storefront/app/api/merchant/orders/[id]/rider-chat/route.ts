import { NextRequest, NextResponse } from 'next/server';
import { merchantRiderChatHref } from '@/lib/shopChat';
import { localListDispatchJobs } from '@/lib/server/localDispatch';

export async function GET(
  req: NextRequest,
  ctx: { params: { id: string } },
) {
  const merchantId = req.nextUrl.searchParams.get('merchant_id') || '';
  const orderId = ctx.params.id;
  if (!merchantId) {
    return NextResponse.json({ error: 'merchant_id required' }, { status: 400 });
  }

  const { jobs } = await localListDispatchJobs({});
  const job = jobs.find(
    (j) => j.order_id === orderId && j.merchant_id === merchantId && j.rider_id,
  );

  if (!job?.rider_id) {
    return NextResponse.json({ available: false });
  }

  const buyerId = `rider:${job.rider_id}`;
  return NextResponse.json({
    available: true,
    rider_id: job.rider_id,
    href: merchantRiderChatHref(merchantId, buyerId, { orderId }),
  });
}
