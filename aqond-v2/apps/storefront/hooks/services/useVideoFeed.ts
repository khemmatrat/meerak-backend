'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import {
  addVideoComment,
  canVideoEngage,
  fetchVideoComments,
  fetchVideoFeed,
  formatEngagementCount,
  toggleVideoLike,
  toggleVideoSave,
} from '@/lib/services/videoApi';
import type { TalentVideo, VideoComment } from '@/lib/services/videoTypes';

export function useVideoFeed() {
  const { auth } = useAuth();
  const [videos, setVideos] = useState<TalentVideo[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [actingId, setActingId] = useState<string | null>(null);

  const load = useCallback(
    async (append = false) => {
      if (append) setLoadingMore(true);
      else setLoading(true);
      setErr(null);
      try {
        const out = await fetchVideoFeed(append ? cursor : null, auth);
        setVideos((prev) => (append ? [...prev, ...out.videos] : out.videos));
        setCursor(out.nextCursor);
        setHasMore(out.hasMore);
      } catch (e) {
        setErr(e instanceof Error ? e.message : 'โหลดฟีดไม่สำเร็จ');
        if (!append) setVideos([]);
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [auth, cursor],
  );

  useEffect(() => {
    void load(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- initial load only
  }, [auth?.userId]);

  const loadMore = () => {
    if (!hasMore || loadingMore) return;
    void load(true);
  };

  const like = useCallback(
    async (video: TalentVideo) => {
      if (!canVideoEngage(video)) return;
      setActingId(video.id);
      try {
        const out = await toggleVideoLike(video.id, auth);
        setVideos((prev) =>
          prev.map((v) =>
            v.id === video.id
              ? { ...v, liked_by_me: out.liked, like_count: out.like_count }
              : v,
          ),
        );
      } catch (e) {
        setErr(e instanceof Error ? e.message : 'ไลค์ไม่สำเร็จ');
      } finally {
        setActingId(null);
      }
    },
    [auth],
  );

  const save = useCallback(
    async (video: TalentVideo) => {
      if (!canVideoEngage(video)) return;
      setActingId(video.id);
      try {
        const out = await toggleVideoSave(video.id, auth);
        setVideos((prev) =>
          prev.map((v) =>
            v.id === video.id
              ? { ...v, saved_by_me: out.saved, save_count: out.save_count }
              : v,
          ),
        );
      } catch (e) {
        setErr(e instanceof Error ? e.message : 'บันทึกไม่สำเร็จ');
      } finally {
        setActingId(null);
      }
    },
    [auth],
  );

  return {
    videos,
    loading,
    loadingMore,
    hasMore,
    err,
    actingId,
    loadMore,
    like,
    save,
    reload: () => void load(false),
    formatCount: formatEngagementCount,
  };
}

export function useVideoComments(videoId: string | null) {
  const { auth } = useAuth();
  const router = useRouter();
  const [comments, setComments] = useState<VideoComment[]>([]);
  const [loading, setLoading] = useState(false);
  const [text, setText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!videoId) return;
    setLoading(true);
    try {
      const rows = await fetchVideoComments(videoId, auth);
      setComments(rows);
    } catch {
      setComments([]);
    } finally {
      setLoading(false);
    }
  }, [auth, videoId]);

  useEffect(() => {
    void load();
  }, [load]);

  const submit = useCallback(async () => {
    if (!videoId || !text.trim()) return;
    if (!auth?.userId) {
      router.push('/m/login');
      return;
    }
    setSubmitting(true);
    setErr(null);
    try {
      const out = await addVideoComment(videoId, text.trim(), auth);
      setComments((prev) => [out.comment, ...prev]);
      setText('');
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'ส่งคอมเมนต์ไม่สำเร็จ');
    } finally {
      setSubmitting(false);
    }
  }, [auth, router, text, videoId]);

  return { comments, loading, text, setText, submitting, err, submit, reload: load };
}
