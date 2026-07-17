import { NextRequest } from 'next/server';
import { buildTrackOsProjection } from '@/lib/server/trackOsProjection';

type Ctx = { params: Promise<{ orderId: string }> };

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest, ctx: Ctx) {
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
        const projection = await buildTrackOsProjection(orderId);
        if (!projection) {
          send({ type: 'not_found', order_id: orderId });
          return;
        }
        if (projection.realtime_seq !== lastSeq) {
          lastSeq = projection.realtime_seq;
          send({
            type: 'track_update',
            order_id: orderId,
            seq: projection.realtime_seq,
            phase: projection.phase,
          });
        } else {
          send({ type: 'heartbeat', seq: lastSeq });
        }
      };

      void tick();
      const interval = setInterval(() => void tick(), 4000);

      req.signal.addEventListener('abort', () => {
        closed = true;
        clearInterval(interval);
        try {
          controller.close();
        } catch {
          /* noop */
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
