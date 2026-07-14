'use client';

import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth';
import { acceptMatchJob, fetchMatchJobDetail } from '@/lib/services/matchJobApi';
import { JobStatus, type MatchJob } from '@/lib/services/matchJobTypes';

export function useMatchJobDetail(jobId: string) {
  const { auth } = useAuth();
  const [job, setJob] = useState<MatchJob | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [accepting, setAccepting] = useState(false);
  const [msg, setMsg] = useState('');

  const reload = useCallback(async () => {
    if (!jobId) return;
    setLoading(true);
    setErr('');
    try {
      const j = await fetchMatchJobDetail(jobId, auth);
      setJob(j || null);
      if (!j) setErr('ไม่พบงานนี้');
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'โหลดไม่สำเร็จ');
      setJob(null);
    } finally {
      setLoading(false);
    }
  }, [jobId, auth]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const accept = async () => {
    if (!auth?.userId || !jobId) {
      setErr('กรุณาเข้าสู่ระบบก่อนรับงาน');
      return;
    }
    if (job?.status !== JobStatus.OPEN) {
      setErr('งานนี้ไม่เปิดรับแล้ว');
      return;
    }
    setAccepting(true);
    setErr('');
    setMsg('');
    try {
      await acceptMatchJob(jobId, auth.userId, auth);
      setMsg('รับงานสำเร็จ');
      await reload();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'รับงานไม่สำเร็จ');
    } finally {
      setAccepting(false);
    }
  };

  const canAccept =
    !!auth?.userId &&
    job?.status === JobStatus.OPEN &&
    !job?.accepted_by;

  return { job, loading, err, msg, accepting, canAccept, accept, reload };
}
