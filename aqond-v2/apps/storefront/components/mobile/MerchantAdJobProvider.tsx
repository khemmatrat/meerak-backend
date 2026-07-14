'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  MAD_JOB_EVENT,
  dismissAdJobOverlay,
  listTrackedAdJobs,
  registerTrackedAdJob,
  removeTrackedAdJob,
  type TrackedAdJobMeta,
} from '@/lib/merchantAdBackgroundJob';
import { fetchAdJob, type AdVideoJob } from '@/lib/merchantAdVideo';
import { resumeInterruptedPublishJobs } from '@/lib/merchantAdPublishRunner';

type TrackedEntry = {
  meta: TrackedAdJobMeta;
  job: AdVideoJob | null;
};

type MerchantAdJobCtx = {
  entries: TrackedEntry[];
  registerJob: (meta: Omit<TrackedAdJobMeta, 'overlayDismissed'> & { overlayDismissed?: boolean }) => void;
  dismissOverlay: (jobId: string) => void;
  entryForMerchant: (merchantId: string) => TrackedEntry | null;
  publishEntryForJob: (jobId: string) => TrackedEntry | null;
  refresh: () => void;
};

const MerchantAdJobContext = createContext<MerchantAdJobCtx | null>(null);

export function useMerchantAdJobs() {
  const ctx = useContext(MerchantAdJobContext);
  if (!ctx) throw new Error('useMerchantAdJobs outside MerchantAdJobProvider');
  return ctx;
}

export function MerchantAdJobProvider({ children }: { children: ReactNode }) {
  const [entries, setEntries] = useState<TrackedEntry[]>(() =>
    listTrackedAdJobs().map((meta) => ({ meta, job: null })),
  );
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const syncFromStorage = useCallback(() => {
    const metas = listTrackedAdJobs();
    setEntries((prev) => {
      const byId = new Map(prev.map((e) => [e.meta.jobId, e]));
      return metas.map((meta) => {
        const hit = byId.get(meta.jobId);
        return { meta, job: hit?.job ?? null };
      });
    });
  }, []);

  useEffect(() => {
    syncFromStorage();
    resumeInterruptedPublishJobs({
      onComplete: () => syncFromStorage(),
      onFail: () => syncFromStorage(),
    });
    const onStorage = () => syncFromStorage();
    window.addEventListener(MAD_JOB_EVENT, onStorage);
    return () => window.removeEventListener(MAD_JOB_EVENT, onStorage);
  }, [syncFromStorage]);

  const pollAll = useCallback(async () => {
    const metas = listTrackedAdJobs();
    if (!metas.length) return;

    const generateMetas = metas.filter((m) => (m.kind || 'generate') === 'generate');
    const publishMetas = metas.filter((m) => m.kind === 'publish');
    const generateResults = await Promise.all(
      generateMetas.map(async (meta) => {
        try {
          const job = await fetchAdJob(meta.jobId);
          return { meta, job };
        } catch {
          return { meta, job: null };
        }
      }),
    );
    const results = [
      ...generateResults,
      ...publishMetas.map((meta) => ({ meta, job: null as AdVideoJob | null })),
    ];

    setEntries(results);

    let removed = false;
    for (const { meta, job } of results) {
      if (!job || meta.kind === 'publish') continue;
      if (job.status === 'completed') {
        removeTrackedAdJob(meta.jobId);
        removed = true;
        if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
          new Notification('คลิปโฆษณาพร้อมแล้ว', {
            body: `${meta.merchantName} — วิดีโอสร้างเสร็จแล้ว`,
          });
        }
      } else if (job.status === 'failed') {
        removeTrackedAdJob(meta.jobId);
        removed = true;
      }
    }
    if (removed) {
      const metas = listTrackedAdJobs();
      setEntries(
        metas.map((meta) => {
          const hit = results.find((r) => r.meta.jobId === meta.jobId);
          return { meta, job: hit?.job ?? null };
        }),
      );
    }
  }, []);

  useEffect(() => {
    if (pollRef.current) clearInterval(pollRef.current);
    const hasGenerate = entries.some((e) => (e.meta.kind || 'generate') === 'generate');
    if (!hasGenerate) return;

    void pollAll();
    pollRef.current = setInterval(() => void pollAll(), 2500);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
      pollRef.current = null;
    };
  }, [entries, pollAll]);

  const registerJob = useCallback(
    (meta: Omit<TrackedAdJobMeta, 'overlayDismissed'> & { overlayDismissed?: boolean }) => {
      registerTrackedAdJob(meta);
      syncFromStorage();
    },
    [syncFromStorage],
  );

  const dismissOverlay = useCallback(
    (jobId: string) => {
      dismissAdJobOverlay(jobId);
      syncFromStorage();
    },
    [syncFromStorage],
  );

  const entryForMerchant = useCallback(
    (merchantId: string) =>
      entries.find((e) => e.meta.merchantId === merchantId && (e.meta.kind || 'generate') === 'generate') || null,
    [entries],
  );

  const publishEntryForJob = useCallback(
    (jobId: string) => entries.find((e) => e.meta.jobId === jobId && e.meta.kind === 'publish') || null,
    [entries],
  );

  const value = useMemo(
    () => ({
      entries,
      registerJob,
      dismissOverlay,
      entryForMerchant,
      publishEntryForJob,
      refresh: syncFromStorage,
    }),
    [entries, registerJob, dismissOverlay, entryForMerchant, publishEntryForJob, syncFromStorage],
  );

  return <MerchantAdJobContext.Provider value={value}>{children}</MerchantAdJobContext.Provider>;
}
