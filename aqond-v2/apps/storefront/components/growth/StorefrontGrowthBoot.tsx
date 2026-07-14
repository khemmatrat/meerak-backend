'use client';

import { useEffect } from 'react';
import { readStoredAuth } from '@/lib/meerakAuth';
import {
  recordStorefrontAppOpen,
  startStorefrontIntentFlushLoop,
} from '@/lib/intentDwell';

/** Starts intent batch flush + temporal app-open pattern for storefront /m */
export function StorefrontGrowthBoot() {
  useEffect(() => {
    startStorefrontIntentFlushLoop();
    const auth = readStoredAuth();
    if (auth?.userId) void recordStorefrontAppOpen();

    if ('serviceWorker' in navigator) {
      void navigator.serviceWorker.register('/sw.js').catch(() => {
        /* optional shell cache */
      });
    }
  }, []);
  return null;
}
