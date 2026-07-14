'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import {
  createMatchJobPaymentIntent,
  fetchMatchJobDetail,
  type PaymentIntentResult,
} from '@/lib/services/matchJobApi';
import type { MatchJob } from '@/lib/services/matchJobTypes';
import { JobStatus } from '@/lib/services/matchJobTypes';

export function useMatchJobPayment(jobId: string) {
  const router = useRouter();
  const { auth, user } = useAuth();
  const [job, setJob] = useState<MatchJob | undefined>();
  const [loading, setLoading] = useState(true);
  const [paying, setPaying] = useState(false);
  const [intent, setIntent] = useState<PaymentIntentResult | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [hasInsurance, setHasInsurance] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const detail = await fetchMatchJobDetail(jobId, auth);
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
    !!user?.id &&
    !!job?.created_by &&
    String(job.created_by) === String(user.id);

  const canPay =
    isEmployer &&
    (job?.status === JobStatus.WAITING_FOR_PAYMENT ||
      job?.status === JobStatus.ACCEPTED ||
      job?.status === JobStatus.IN_PROGRESS ||
      job?.status === JobStatus.WAITING_FOR_APPROVAL);

  const startPayment = useCallback(async () => {
    if (!user?.id) {
      router.push('/m/login');
      return;
    }
    setPaying(true);
    setMsg(null);
    setErr(null);
    try {
      const out = await createMatchJobPaymentIntent(jobId, auth, { has_insurance: hasInsurance });
      setIntent(out);
      setMsg('สร้างรายการชำระเงินสำเร็จ — ดำเนินการชำระต่อในแอปหรือ Stripe');
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'ชำระเงินไม่สำเร็จ');
    } finally {
      setPaying(false);
    }
  }, [auth, hasInsurance, jobId, router, user?.id]);

  return {
    job,
    loading,
    paying,
    intent,
    err,
    msg,
    hasInsurance,
    setHasInsurance,
    isEmployer,
    canPay,
    startPayment,
    reload: load,
  };
}
