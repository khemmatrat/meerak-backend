'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button, EmptyState } from '@aqond/ui';
import { formatCatalogPrice } from '@/lib/format';
import { acceptRiderJob, fetchRiderJobs, type RiderJob } from '@/lib/rider';
import { fetchRiderEarnings, requestRiderWithdraw } from '@/lib/orders';
import { useRider } from '@/components/mobile/RiderShell';
import { AxsRiderLoading } from '@/components/axs/rider/AxsRiderLoading';

const PHASE_LABEL: Record<string, string> = {
  pending_accept: 'รอยืนยันรับงาน',
  rider_assigned: 'ไปรับที่ร้าน',
  rider_picked_up: 'กำลังส่ง',
  en_route: 'กำลังส่ง',
};

export default function RiderMinePage() {
  const router = useRouter();
  const { riderId, canOperate } = useRider();
  const [jobs, setJobs] = useState<RiderJob[]>([]);
  const [earnings, setEarnings] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState<string | null>(null);

  const reload = useCallback(() => {
    if (!canOperate || !riderId) {
      setJobs([]);
      setEarnings(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    Promise.all([
      fetchRiderJobs(riderId, 'mine').then((d) => setJobs(d.jobs || [])),
      fetchRiderEarnings(riderId).then(setEarnings).catch(() => setEarnings(null)),
    ]).finally(() => setLoading(false));
  }, [riderId, canOperate]);

  useEffect(() => {
    reload();
    const t = setInterval(reload, 15000);
    return () => clearInterval(t);
  }, [reload]);

  const withdraw = async () => {
    setErr('');
    setMsg('');
    try {
      const r = await requestRiderWithdraw(riderId);
      setMsg(`ขอถอน ฿${((r.amount_micro || 0) / 100).toFixed(2)} — รอแอดมินอนุมัติ`);
      reload();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'ถอนไม่สำเร็จ');
    }
  };

  const confirmPending = async (jobId: string) => {
    setBusy(jobId);
    setErr('');
    try {
      await acceptRiderJob(jobId, riderId);
      window.location.href = `/m/rider/active/${jobId}`;
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'ยืนยันไม่สำเร็จ');
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="tt-rider-jobs-premium">
      <h2 className="tt-rider-section-title">งานของฉัน</h2>

      {earnings && (
        <section className="tt-rider-earnings-card">
          <p className="tt-rider-earnings-label">รายได้สะสม</p>
          <p className="tt-rider-earnings-amount">{formatCatalogPrice(earnings.earnings_micro || 0)}</p>
          <p className="tt-hint">
            ถอนได้ {formatCatalogPrice(earnings.withdrawable_micro || 0)}
            {earnings.kyc_status !== 'approved' && ' · รอ KYC อนุมัติ'}
          </p>
          <Button
            type="button"
            variant="primary"
            className="tt-rider-accept-btn"
            disabled={!earnings.withdrawable_micro || earnings.kyc_status !== 'approved'}
            onClick={() => void withdraw()}
          >
            ขอถอนเงิน
          </Button>
        </section>
      )}

      {msg && <p className="tt-merchant-ok">{msg}</p>}
      {err && <p className="tt-error-inline">{err}</p>}
      {loading && <AxsRiderLoading label="กำลังโหลดงาน…" />}

      {!loading && jobs.length === 0 && (
        <EmptyState
          icon="📦"
          title="ยังไม่มีงานที่รับ"
          description="ไปดูงานใหม่และกดรับงานเพื่อเริ่มส่ง"
          actionLabel="ไปดูงานใหม่"
          onAction={() => router.push('/m/rider/jobs')}
        />
      )}

      <div className="tt-rider-job-cards">
        {jobs.map((j) => (
          <article key={j.id} className="tt-rider-job-card">
            <div className="tt-rider-job-top">
              <strong>#{j.order_id.slice(-8)}</strong>
              <span>{PHASE_LABEL[j.phase] || j.phase}</span>
            </div>
            <p className="tt-rider-job-meta">{formatCatalogPrice(j.amount_micro || 0)}</p>
            <div className="tt-rider-job-foot">
              {j.phase === 'pending_accept' ? (
                <button
                  type="button"
                  className="tt-rider-accept-btn"
                  disabled={busy === j.id}
                  onClick={() => void confirmPending(j.id)}
                >
                  ยืนยันรับงาน
                </button>
              ) : j.status !== 'completed' ? (
                <Link href={`/m/rider/active/${j.id}`} className="tt-rider-accept-btn" style={{ textAlign: 'center' }}>
                  ดำเนินการ
                </Link>
              ) : (
                <span className="tt-hint">สำเร็จแล้ว</span>
              )}
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
