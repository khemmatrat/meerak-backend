'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { readStoredAuth } from '@/lib/meerakAuth';
import { getOrCreateGuestId } from './guestStorage';
import type { ExperienceSnapshot } from './types';

const FIRST_LAUNCH_KEY = 'aqond_exp_first_launch_v1';

function experienceHeaders(): Record<string, string> {
  const h: Record<string, string> = {};
  const stored = readStoredAuth();
  if (stored?.token) h.Authorization = `Bearer ${stored.token}`;
  if (stored?.userId) h['X-User-Id'] = stored.userId;
  return h;
}

type UseExperienceStateResult = {
  state: ExperienceSnapshot | null;
  loading: boolean;
  guestId: string | null;
  refresh: () => Promise<void>;
  postEvent: (eventType: string, payload?: Record<string, unknown>) => Promise<void>;
};

export function useExperienceState(surface = 'home', enabled = true): UseExperienceStateResult {
  const [state, setState] = useState<ExperienceSnapshot | null>(null);
  const [loading, setLoading] = useState(enabled);
  const [guestId, setGuestId] = useState<string | null>(null);
  const firstLaunchSent = useRef(false);

  const refresh = useCallback(async () => {
    if (!enabled) {
      setLoading(false);
      return;
    }
    const id = getOrCreateGuestId();
    setGuestId(id);
    setLoading(true);
    try {
      const q = new URLSearchParams({ surface, guestId: id });
      const res = await fetch(`/api/experience/state?${q}`, {
        cache: 'no-store',
        headers: experienceHeaders(),
      });
      const data = (await res.json().catch(() => ({}))) as ExperienceSnapshot;
      setState(data);
    } catch {
      setState(null);
    } finally {
      setLoading(false);
    }
  }, [enabled, surface]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!enabled || firstLaunchSent.current) return;
    if (typeof localStorage === 'undefined') return;
    if (localStorage.getItem(FIRST_LAUNCH_KEY)) return;
    firstLaunchSent.current = true;
    localStorage.setItem(FIRST_LAUNCH_KEY, '1');
    const id = guestId || getOrCreateGuestId();
    void fetch('/api/experience/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...experienceHeaders() },
      body: JSON.stringify({
        event_type: 'experience.first_launch',
        guest_id: id,
        payload: { surface },
      }),
    }).catch(() => {});
  }, [enabled, guestId, surface]);

  const postEvent = useCallback(
    async (eventType: string, payload: Record<string, unknown> = {}) => {
      if (!enabled) return;
      const id = guestId || getOrCreateGuestId();
      try {
        await fetch('/api/experience/events', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...experienceHeaders() },
          body: JSON.stringify({
            event_type: eventType,
            guest_id: id,
            payload,
          }),
        });
      } catch {
        /* non-blocking */
      }
    },
    [enabled, guestId],
  );

  return { state, loading, guestId, refresh, postEvent };
}
