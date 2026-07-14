import type { RiderTrackingView } from '@/lib/server/riderTracking';

function dispatchWsUrl(orderId: string): string {
  const prefix =
    (typeof window !== 'undefined' && process.env.NEXT_PUBLIC_API_V2_PREFIX) ||
    '/api/v1';
  const http =
    (typeof window !== 'undefined' && process.env.NEXT_PUBLIC_KONG_URL) ||
    'http://127.0.0.1:8000';
  const wsBase = http.replace(/^http/, 'ws').replace(/\/$/, '');
  if (prefix.startsWith('/api/v2')) {
    return `${wsBase}/api/v2/rider-merch/v1/dispatch/ws/track?order_id=${encodeURIComponent(orderId)}`;
  }
  return `${wsBase}/api/v1/dispatch/v1/dispatch/ws/track?order_id=${encodeURIComponent(orderId)}`;
}

export function connectDispatchTrackWs(
  orderId: string,
  onUpdate: (tracking: RiderTrackingView) => void,
  onError?: (err: string) => void,
): () => void {
  let alive = true;
  let ws: WebSocket | null = null;
  let retryTimer: number | null = null;
  let pollTimer: number | null = null;

  const pollFallback = async () => {
    try {
      const res = await fetch(`/api/food/tracking/${encodeURIComponent(orderId)}`, {
        cache: 'no-store',
      });
      if (res.ok && alive) {
        onUpdate((await res.json()) as RiderTrackingView);
      }
    } catch {
      /* ignore */
    }
  };

  const connect = () => {
    if (!alive) return;
    const url = dispatchWsUrl(orderId);
    try {
      ws = new WebSocket(url);
    } catch {
      onError?.('ws_connect_failed');
      return;
    }

    ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(String(ev.data)) as {
          type?: string;
          tracking?: RiderTrackingView;
        };
        if (msg.tracking) onUpdate(msg.tracking);
      } catch {
        /* ignore */
      }
    };

    ws.onerror = () => onError?.('ws_error');

    ws.onclose = () => {
      if (!alive) return;
      retryTimer = window.setTimeout(connect, 4000);
    };
  };

  void pollFallback();
  pollTimer = window.setInterval(pollFallback, 15000);
  connect();

  return () => {
    alive = false;
    if (retryTimer) window.clearTimeout(retryTimer);
    if (pollTimer) window.clearInterval(pollTimer);
    ws?.close();
  };
}
