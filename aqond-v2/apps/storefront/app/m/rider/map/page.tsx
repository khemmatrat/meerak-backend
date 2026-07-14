'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button, EmptyState } from '@aqond/ui';
import { acceptRiderJob, fetchRiderJobs, type RiderJob } from '@/lib/rider';
import { RiderJobsMap } from '@/components/mobile/RiderJobsMap';
import { useRider } from '@/components/mobile/RiderShell';

export default function RiderMapPage() {
  const router = useRouter();
  const { riderId, canOperate } = useRider();
  const [jobs, setJobs] = useState<RiderJob[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState('');

  const reload = useCallback(() => {
    if (!canOperate || !riderId) {
      setJobs([]);
      return;
    }
    fetchRiderJobs(riderId, 'open')
      .then((d) => {
        const list = d.jobs || [];
        setJobs(list);
        setSelectedId((prev) => (prev && list.some((j) => j.id === prev) ? prev : list[0]?.id || null));
      })
      .catch((e) => setErr(e.message));
  }, [riderId, canOperate]);

  useEffect(() => {
    reload();
    const t = setInterval(reload, 12000);
    return () => clearInterval(t);
  }, [reload]);

  const selected = jobs.find((j) => j.id === selectedId);

  const accept = async (jobId: string) => {
    if (!riderId) return;
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

  return (
    <div className="tt-rider-map-page">
      <RiderJobsMap jobs={jobs} selectedId={selectedId} onSelect={(j) => setSelectedId(j.id)} />
      {err && <p className="tt-error-inline">{err}</p>}
      {selected && (
        <div className="tt-rider-map-sheet">
          <p className="tt-rider-job-shop">{selected.merchant_name}</p>
          <p className="tt-rider-job-addr">📍 {selected.address}</p>
          <div className="tt-rider-job-foot">
            <Link href="/m/rider/jobs" className="tt-rider-link">ดูรายการ →</Link>
            <Button
              type="button"
              variant="primary"
              className="tt-rider-accept-btn"
              disabled={busy === selected.id || !canOperate}
              onClick={() => void accept(selected.id)}
            >
              {busy === selected.id ? '…' : 'รับงานนี้'}
            </Button>
          </div>
        </div>
      )}
      {!jobs.length && (
        <EmptyState
          icon="🗺️"
          title="ยังไม่มีงานบนแผนที่"
          description="ลองรีเฟรชหรือเปิดสถานะออนไลน์ที่หน้าหลัก"
          actionLabel="ไปหน้าหลัก"
          onAction={() => router.push('/m/rider/home')}
        />
      )}
    </div>
  );
}
