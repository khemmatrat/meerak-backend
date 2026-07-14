/**
 * Intent dwell batching — storefront client (silent, 30s flush)
 */

export type IntentDwellEvent = {
  entity_type: string;
  entity_id: string;
  dwell_ms: number;
  surface?: string;
};

const FLUSH_MS = 30_000;
const MIN_DWELL_MS = 5000;

const queue: IntentDwellEvent[] = [];
let flushTimer: ReturnType<typeof setInterval> | null = null;
let flushInFlight = false;

function getUserId(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return localStorage.getItem('meerak_user_id');
  } catch {
    return null;
  }
}

async function flushIntentQueue() {
  const userId = getUserId();
  if (!userId || flushInFlight || queue.length === 0) return;
  flushInFlight = true;
  const batch = queue.splice(0, queue.length);
  try {
    const res = await fetch('/api/growth/intent-dwell', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, events: batch }),
    });
    if (!res.ok) queue.unshift(...batch);
  } catch {
    queue.unshift(...batch);
  } finally {
    flushInFlight = false;
  }
}

export function startStorefrontIntentFlushLoop() {
  if (typeof window === 'undefined' || flushTimer) return;
  flushTimer = setInterval(() => void flushIntentQueue(), FLUSH_MS);
  window.addEventListener('pagehide', () => void flushIntentQueue());
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') void flushIntentQueue();
  });
}

export function enqueueStorefrontIntentDwell(event: IntentDwellEvent) {
  if (!getUserId()) return;
  if (!event.entity_type || !event.entity_id || event.dwell_ms < MIN_DWELL_MS) return;
  queue.push(event);
}

export async function recordStorefrontAppOpen(dominantIntent?: string) {
  const userId = getUserId();
  if (!userId) return;
  try {
    await fetch('/api/growth/app-open', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, dominant_intent: dominantIntent }),
    });
  } catch {
    /* silent */
  }
}
