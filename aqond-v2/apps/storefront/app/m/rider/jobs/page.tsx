'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { EmptyState } from '@aqond/ui';
import { formatCatalogPrice } from '@/lib/format';
import { acceptRiderJob, fetchRiderJobs, type RiderJob } from '@/lib/rider';
import { PARTNER_ACTIVATE } from '@/lib/authMessaging';
import { useRider } from '@/components/mobile/RiderShell';
import { useAuth } from '@/lib/auth';
import { fcmWebConfigured, registerRiderFcm } from '@/lib/fcmWeb';
import { RiderJobsMap } from '@/components/mobile/RiderJobsMap';
import { AxsRiderLoading } from '@/components/axs/rider/AxsRiderLoading';

export default function RiderJobsPage() {
  const { riderId, canOperate, profileLoading, profile } = useRider();
  const { auth } = useAuth();
  const [jobs, setJobs] = useState<RiderJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [pushBusy, setPushBusy] = useState(false);
  const [pushOk, setPushOk] = useState(false);
  const fcmReady = fcmWebConfigured();

  const pendingApproval =
    !profileLoading &&
    !!profile?.rider_id &&
    !canOperate;

  const reload = useCallback(() => {
    if (!canOperate || !riderId || pendingApproval) {
      setJobs([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    fetchRiderJobs(riderId, 'open')
      .then((d) => {
        const list = d.jobs || [];
        setJobs(list);
        setSelectedId((prev) => (prev && list.some((j) => j.id === prev) ? prev : list[0]?.id || null));
      })
      .catch((e) => setErr(e.message))
      .finally(() => setLoading(false));
  }, [riderId, canOperate, pendingApproval]);

  useEffect(() => {
    if (pendingApproval) {
      setJobs([]);
      setLoading(false);
      return;
    }
    reload();
    const t = setInterval(reload, 12000);
    return () => clearInterval(t);
  }, [reload, pendingApproval]);

  const enablePush = async () => {
    if (!auth) {
      setErr('เข้าสู่ระบบก่อนเปิด Push');
      return;
    }
    setPushBusy(true);
    setErr('');
    try {
      const tok = await registerRiderFcm(auth);
      setPushOk(!!tok);
      if (!tok) setErr('เปิด Push ไม่สำเร็จ — ตรวจสอบการอนุญาตแจ้งเตือน');
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'เปิด Push ไม่สำเร็จ');
    } finally {
      setPushBusy(false);
    }
  };

  const accept = async (jobId: string) => {
    if (!canOperate || !riderId) {
      setErr('ต้องยืนยันตัวตนผู้ให้บริการก่อนรับงาน');
      return;
    }
    setBusy(jobId);
    setErr('');
    try {
      await acceptRiderJob(jobId, riderId);
      window.location.href = `/m/rider/active/${jobId}`;
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'รับงานไม่สำเร็จ');
    } finally {
      setBusy(null);
    }
  };

  if (pendingApproval) {
    return (
      <div className="tt-rider-jobs-premium">
        <EmptyState
          icon="🛡️"
          title="รอการอนุมัติ"
          description="ทีม AQOND กำลังตรวจสอบ KYC และเอกสารของคุณ งานจะแสดงเมื่ออนุมัติแล้ว"
        />
        {auth && fcmReady && !pushOk && (
          <button type="button" className="tt-rider-push-btn" disabled={pushBusy} onClick={() => void enablePush()}>
            {pushBusy ? 'กำลังเปิด Push…' : '🔔 แจ้งเตือนเมื่ออนุมัติ'}
          </button>
        )}
        {err && <p className="tt-error-inline">{err}</p>}
      </div>
    );
  }

  return (
    <div className="tt-rider-jobs-premium">
      <div className="tt-rider-section-head">
        <h2>
          <span className="tt-rider-pulse" />
          รายการงานที่รอคุณอยู่
        </h2>
        <Link href="/m/rider/mine" className="tt-rider-link">ดูงานที่รับแล้ว →</Link>
      </div>

      {auth && fcmReady && !pushOk && (
        <button type="button" className="tt-rider-push-btn" disabled={pushBusy} onClick={() => void enablePush()}>
          {pushBusy ? 'กำลังเปิด Push…' : '🔔 เปิด Push งานใหม่'}
        </button>
      )}

      {!loading && jobs.length > 0 && (
        <RiderJobsMap jobs={jobs} selectedId={selectedId} onSelect={(j) => setSelectedId(j.id)} />
      )}

      {loading && (
        <AxsRiderLoading label="กำลังค้นหางานใหม่ในพื้นที่…" />
      )}

      {err && <p className="tt-error-inline">{err}</p>}

      {!loading && jobs.length === 0 && (
        <EmptyState
          icon="📋"
          title="ยังไม่มีงานเปิด"
          description='รอร้านกด "เรียกไรเดอร์" หรือเปิด Push เพื่อรับแจ้งเตือน'
        />
      )}

      <div className="tt-rider-job-cards">
        {jobs.map((j) => (
          <article
            key={j.id}
            className={`tt-rider-job-card${selectedId === j.id ? ' selected' : ''}`}
            onClick={() => setSelectedId(j.id)}
          >
            <div className="tt-rider-job-top">
              <strong>#{j.order_id.slice(-8)}</strong>
              <span>{j.payment_method?.toUpperCase()}</span>
            </div>
            <p className="tt-rider-job-shop">{j.merchant_name || j.merchant_id}</p>
            {j.items_summary && <p className="tt-rider-job-meta">{j.items_summary}</p>}
            {j.address && <p className="tt-rider-job-addr">📍 {j.address}</p>}
            <div className="tt-rider-job-foot">
              <strong>{formatCatalogPrice(j.amount_micro || 0)}</strong>
              <button
                type="button"
                className="tt-rider-accept-btn"
                disabled={busy === j.id || !canOperate}
                onClick={() => void accept(j.id)}
              >
                {busy === j.id ? '…' : 'รับงาน'}
              </button>
            </div>
          </article>
        ))}
      </div>

      <Link href="/m/rider/signup" className="tt-rider-kyc-btn">
        🛡️ {PARTNER_ACTIVATE.delivery} — ยืนยันตัวตน
      </Link>
    </div>
  );
}
