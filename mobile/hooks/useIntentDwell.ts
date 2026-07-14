/**
 * Intent dwell batching — silent telemetry (>5s visible) flushed every 30s
 */
import { useEffect, useRef } from "react";
import {
  postIntentDwellEvents,
  type IntentDwellEvent,
} from "../services/growthEngineService";

const FLUSH_MS = 30_000;
const MIN_DWELL_MS = 5000;
const VISIBILITY_THRESHOLD = 0.45;

const queue: IntentDwellEvent[] = [];
let flushTimer: ReturnType<typeof setInterval> | null = null;
let flushInFlight = false;

async function flushIntentQueue() {
  if (flushInFlight || queue.length === 0) return;
  flushInFlight = true;
  const batch = queue.splice(0, queue.length);
  try {
    await postIntentDwellEvents(batch);
  } catch {
    queue.unshift(...batch);
  } finally {
    flushInFlight = false;
  }
}

export function startIntentDwellFlushLoop() {
  if (typeof window === "undefined" || flushTimer) return;
  flushTimer = setInterval(() => void flushIntentQueue(), FLUSH_MS);
  window.addEventListener("pagehide", () => void flushIntentQueue());
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") void flushIntentQueue();
  });
}

export function enqueueIntentDwell(event: IntentDwellEvent) {
  if (!event.entity_type || !event.entity_id) return;
  if (event.dwell_ms < MIN_DWELL_MS) return;
  queue.push(event);
}

export interface UseIntentDwellOptions {
  entity_type: string;
  entity_id: string;
  surface?: string;
  enabled?: boolean;
}

export function useIntentDwell(
  ref: React.RefObject<HTMLElement | null>,
  opts: UseIntentDwellOptions,
) {
  const { entity_type, entity_id, surface, enabled = true } = opts;
  const visibleSinceRef = useRef<number | null>(null);
  const accumulatedRef = useRef(0);

  useEffect(() => {
    if (!enabled || !entity_type || !entity_id) return;
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") return;

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (!entry) return;
        if (entry.isIntersecting && entry.intersectionRatio >= VISIBILITY_THRESHOLD) {
          if (visibleSinceRef.current == null) {
            visibleSinceRef.current = Date.now();
          }
        } else if (visibleSinceRef.current != null) {
          accumulatedRef.current += Date.now() - visibleSinceRef.current;
          visibleSinceRef.current = null;
        }
      },
      { threshold: [0, VISIBILITY_THRESHOLD, 0.75, 1] },
    );

    observer.observe(el);
    return () => {
      observer.disconnect();
      if (visibleSinceRef.current != null) {
        accumulatedRef.current += Date.now() - visibleSinceRef.current;
        visibleSinceRef.current = null;
      }
      const total =
        accumulatedRef.current +
        (visibleSinceRef.current ? Date.now() - visibleSinceRef.current : 0);
      if (total >= MIN_DWELL_MS) {
        enqueueIntentDwell({
          entity_type,
          entity_id,
          dwell_ms: Math.round(total),
          surface,
        });
      }
      accumulatedRef.current = 0;
    };
  }, [ref, entity_type, entity_id, surface, enabled]);
}
