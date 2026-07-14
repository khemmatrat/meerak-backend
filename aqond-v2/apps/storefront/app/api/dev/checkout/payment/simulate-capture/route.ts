import type { NextRequest } from 'next/server';
import { handleSimulatePaysoCapture } from '@/lib/server/devOnly/simulatePaysoCaptureHandler';

export const dynamic = 'force-dynamic';

/** Dev-only route tree — removed from disk before `next build` (see scripts/strip-dev-api-routes.mjs). */
export async function POST(req: NextRequest) {
  return handleSimulatePaysoCapture(req);
}
