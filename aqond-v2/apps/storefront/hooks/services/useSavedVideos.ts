'use client';

import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth';
import { fetchSavedVideos } from '@/lib/services/videoApi';
import type { TalentVideo } from '@/lib/services/videoTypes';

export function useSavedVideos() {
  const { auth } = useAuth();
  const [videos, setVideos] = useState<TalentVideo[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!auth?.userId) {
      setVideos([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setErr(null);
    try {
      setVideos(await fetchSavedVideos(auth));
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'โหลดไม่สำเร็จ');
      setVideos([]);
    } finally {
      setLoading(false);
    }
  }, [auth]);

  useEffect(() => {
    void load();
  }, [load]);

  return { videos, loading, err, userId: auth?.userId, reload: load };
}
