'use client';

import { useEffect, useRef } from 'react';
import {
  enqueueStorefrontIntentDwell,
  startStorefrontIntentFlushLoop,
} from '@/lib/intentDwell';

const VISIBILITY_THRESHOLD = 0.45;
const MIN_DWELL_MS = 5000;

type Props = {
  entityType: string;
  entityId: string;
  surface?: string;
  enabled?: boolean;
  className?: string;
  children: React.ReactNode;
};

export function IntentDwellTracker({
  entityType,
  entityId,
  surface = 'storefront_home',
  enabled = true,
  className,
  children,
}: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const visibleSinceRef = useRef<number | null>(null);
  const accumulatedRef = useRef(0);

  useEffect(() => {
    startStorefrontIntentFlushLoop();
  }, []);

  useEffect(() => {
    if (!enabled || !entityType || !entityId) return;
    const el = ref.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (!entry) return;
        if (entry.isIntersecting && entry.intersectionRatio >= VISIBILITY_THRESHOLD) {
          if (visibleSinceRef.current == null) visibleSinceRef.current = Date.now();
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
      const total = accumulatedRef.current;
      if (total >= MIN_DWELL_MS) {
        enqueueStorefrontIntentDwell({
          entity_type: entityType,
          entity_id: entityId,
          dwell_ms: Math.round(total),
          surface,
        });
      }
      accumulatedRef.current = 0;
    };
  }, [entityType, entityId, surface, enabled]);

  return (
    <div ref={ref} className={className} data-intent-entity={entityId}>
      {children}
    </div>
  );
}
