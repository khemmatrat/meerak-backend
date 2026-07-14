'use client';

import { bffPost } from './bff';

export function reportRUM(metric: string, value: number, route: string, rating = 'good') {
  bffPost('/v1/rum', { metric, value, route, rating }).catch(() => {});
}

export function initRUM(route: string) {
  if (typeof window === 'undefined' || !('PerformanceObserver' in window)) return;
  try {
    new PerformanceObserver((list) => {
      for (const e of list.getEntries()) {
        const name = e.name || 'LCP';
        reportRUM(name, e.startTime || (e as PerformanceEntry).duration, route);
      }
    }).observe({ type: 'largest-contentful-paint', buffered: true });
  } catch {
    /* ignore */
  }
}
