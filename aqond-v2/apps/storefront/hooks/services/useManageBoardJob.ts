'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import {
  fetchBoardApplicants,
  fetchBoardEscrowBreakdown,
  fetchBoardJobDetail,
  patchBoardApplicant,
  postBoardEscrow,
} from '@/lib/services/boardJobApi';
import type { BoardApplicant, BoardJob, EscrowBreakdown } from '@/lib/services/boardJobTypes';

export type ManageBoardTab = 'applicants' | 'escrow';

export function useManageBoardJob(jobId: string) {
  const router = useRouter();
  const { auth, user } = useAuth();
  const [job, setJob] = useState<BoardJob | undefined>();
  const [applicants, setApplicants] = useState<BoardApplicant[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<ManageBoardTab>('applicants');
  const [patching, setPatching] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [escrowAmount, setEscrowAmount] = useState('');
  const [breakdown, setBreakdown] = useState<EscrowBreakdown | null>(null);
  const [escrowSubmitting, setEscrowSubmitting] = useState(false);
  const [hireAmount, setHireAmount] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const [detail, apps] = await Promise.all([
        fetchBoardJobDetail(jobId, auth),
        fetchBoardApplicants(jobId, auth),
      ]);
      setJob(detail);
      setApplicants(apps);
      if (!detail) setErr('ไม่พบงานนี้');
      if (detail?.agreed_amount) {
        setEscrowAmount(String(detail.agreed_amount));
      } else if (detail?.max_budget) {
        setEscrowAmount(String(detail.max_budget));
      }
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

  const updateApplicant = useCallback(
    async (applicantUserId: string, status: 'shortlisted' | 'hired' | 'rejected') => {
      if (!auth?.userId) {
        router.push(`/m/login?next=/m/services/board/${jobId}/manage`);
        return;
      }
      setPatching(applicantUserId);
      setErr(null);
      setMsg(null);
      try {
        const agreed =
          status === 'hired' ? Number(hireAmount[applicantUserId] || escrowAmount || 0) : undefined;
        await patchBoardApplicant(jobId, applicantUserId, status, auth, agreed);
        setMsg(
          status === 'hired'
            ? 'จ้าง Talent สำเร็จ — ไปแท็บ Escrow เพื่อโอนเงิน'
            : status === 'shortlisted'
              ? 'คัดเลือกแล้ว'
              : 'ปฏิเสธแล้ว',
        );
        if (status === 'hired') setTab('escrow');
        await load();
      } catch (e) {
        setErr(e instanceof Error ? e.message : 'อัปเดตไม่สำเร็จ');
      } finally {
        setPatching(null);
      }
    },
    [auth, escrowAmount, hireAmount, jobId, load, router],
  );

  const loadBreakdown = useCallback(async () => {
    const amount = Number(escrowAmount);
    if (!amount || !auth?.userId) return;
    setErr(null);
    try {
      const b = await fetchBoardEscrowBreakdown(jobId, amount, auth);
      setBreakdown(b);
    } catch (e) {
      setBreakdown(null);
      setErr(e instanceof Error ? e.message : 'คำนวณไม่สำเร็จ');
    }
  }, [auth, escrowAmount, jobId]);

  const submitEscrow = useCallback(async () => {
    const amount = Number(escrowAmount);
    if (!amount) {
      setErr('กรุณาระบุจำนวนเงิน');
      return;
    }
    setEscrowSubmitting(true);
    setErr(null);
    setMsg(null);
    try {
      const out = await postBoardEscrow(jobId, amount, auth);
      setMsg(`โอน Escrow สำเร็จ (สถานะ: ${out.escrow_status})`);
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'โอน Escrow ไม่สำเร็จ');
    } finally {
      setEscrowSubmitting(false);
    }
  }, [auth, escrowAmount, jobId, load]);

  return {
    job,
    applicants,
    loading,
    tab,
    setTab,
    patching,
    err,
    msg,
    isEmployer,
    updateApplicant,
    escrowAmount,
    setEscrowAmount,
    breakdown,
    loadBreakdown,
    escrowSubmitting,
    submitEscrow,
    hireAmount,
    setHireAmount,
    reload: load,
  };
}
