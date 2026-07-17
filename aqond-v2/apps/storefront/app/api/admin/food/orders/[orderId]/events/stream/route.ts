import { NextRequest } from 'next/server';
import { verifyAdminKey } from '@/lib/server/merchantAdmin';
import { buildTrackOsProjection } from '@/lib/server/trackOsProjection';

type Ctx = { params: Promise<{ orderId: string }> };

function check(req: NextRequest) {
  const key = req.headers.get('x-admin-key') || req.nextUrl.searchParams.get('admin_key');
  return verifyAdminKey(key);
}

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest, ctx: Ctx) {
  if (!check(req)) {
    return new Response('unauthorized', { status: 401 });
  }
  const { orderId } = await ctx.params;
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      let lastSeq = -1;
      let closed = false;

      const send = (payload: Record<string, unknown>) => {
        if (closed) return;
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
      };

      const tick = async () => {
        if (closed) return;
        try {
          const projection = await buildTrackOsProjection(orderId);
          if (!projection) return;
          if (projection.realtime_seq !== lastSeq) {
            lastSeq = projection.realtime_seq;
            send({
              type: 'track_update',
              order_id: orderId,
              seq: projection.realtime_seq,
              phase: projection.phase,
              generated_at: projection.generated_at,
            });
          } else {
            send({ type: 'heartbeat', seq: lastSeq, at: new Date().toISOString() });
          }
        } catch {
          send({ type: 'error', message: 'projection_failed' });
        }
      };

      void tick();
      const interval = setInterval(() => void tick(), 3000);

      req.signal.addEventListener('abort', () => {
        closed = true;
        clearInterval(interval);
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      });
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  });
}
