'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import {
  applyToBoardJob,
  fetchBoardJobDetail,
  saveBoardJob,
  unsaveBoardJob,
} from '@/lib/services/boardJobApi';
import type { BoardJob } from '@/lib/services/boardJobTypes';

export function useBoardJobDetail(jobId: string) {
  const router = useRouter();
  const { auth, user } = useAuth();
  const [job, setJob] = useState<BoardJob | undefined>();
  const [loading, setLoading] = useState(true);
  const [applying, setApplying] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const detail = await fetchBoardJobDetail(jobId, auth);
      setJob(detail);
      if (!detail) setErr('ไม่พบงานนี้');
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'โหลดไม่สำเร็จ');
    } finally {
      setLoading(false);
    }
  }, [auth, jobId]);

  useEffect(() => {
    void load();
  }, [load]);

  const isEmployer =
    !!user?.id && !!job?.employer_id && String(job.employer_id) === String(user.id);

  const canApply =
    !!auth?.userId &&
    !isEmployer &&
    job?.status === 'open';

  const apply = useCallback(async () => {
    if (!auth?.userId) {
      router.push(`/m/login?next=/m/services/board/${jobId}`);
      return;
    }
    setApplying(true);
    setErr(null);
    setMsg(null);
    try {
      const out = await applyToBoardJob(jobId, auth);
      setMsg(`ส่งความสนใจสำเร็จ (ผู้สมัคร ${out.applicant_count} คน)`);
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'ส่งข้อเสนอไม่สำเร็จ');
    } finally {
      setApplying(false);
    }
  }, [auth, jobId, load, router]);

  const toggleSave = useCallback(async () => {
    if (!auth?.userId) {
      router.push(`/m/login?next=/m/services/board/${jobId}`);
      return;
    }
    setSaving(true);
    setErr(null);
    try {
      if (saved) {
        await unsaveBoardJob(jobId, auth);
        setSaved(false);
        setMsg('ยกเลิกบันทึกแล้ว');
      } else {
        await saveBoardJob(jobId, auth);
        setSaved(true);
        setMsg('บันทึกงานแล้ว');
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'บันทึกไม่สำเร็จ');
    } finally {
      setSaving(false);
    }
  }, [auth, jobId, router, saved]);

  return {
    job,
    loading,
    applying,
    saving,
    saved,
    err,
    msg,
    isEmployer,
    canApply,
    apply,
    toggleSave,
    reload: load,
  };
}
