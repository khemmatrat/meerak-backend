'use client';

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { formatCatalogPrice } from '@/lib/format';
import {
  fetchOpenRiderJobs,
  fetchRiderJobs,
  acceptRiderJob,
  sendRiderTelemetry,
  setRiderOnlineStatus,
  type RiderJob,
} from '@/lib/rider';
import {
  riderJobsToMapJobs,
  type RepeatCustomer,
  type RiderMapJob,
} from '@/lib/riderMapJobs';
import { disableRiderDevPreview } from '@/lib/riderDevPreview';
import { ProviderRiderMap } from '@/components/mobile/ProviderRiderMapDynamic';
import { useRider } from '@/components/mobile/RiderShell';

export default function RiderMapPage() {
  return (
    <Suspense
      fallback={
        <div className="ros-cream-page p-4 text-sm text-gray-500">กำลังโหลด Rider OS…</div>
      }
    >
      <RiderMapPageInner />
    </Suspense>
  );
}

type TabId = 'open' | 'mine' | 'repeat';

function RiderMapPageInner() {
  const { riderId, canOperate, riderName, profile } = useRider();
  const [tab, setTab] = useState<TabId>('open');
  const [openJobs, setOpenJobs] = useState<RiderJob[]>([]);
  const [myJobs, setMyJobs] = useState<RiderJob[]>([]);
  const [repeatCustomers, setRepeatCustomers] = useState<RepeatCustomer[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState('');
  const [online, setOnline] = useState(true);
  const [seeking, setSeeking] = useState(true);
  const [currentLocation, setCurrentLocation] = useState({ lat: 13.736717, lng: 100.523186 });
  const [pinnedLocation, setPinnedLocation] = useState<{
    lat: number;
    lng: number;
    address?: string;
  } | null>(null);
  const [draftPick, setDraftPick] = useState<{ lat: number; lng: number } | null>(null);

  useEffect(() => {
    disableRiderDevPreview();
  }, []);

  const reload = useCallback(() => {
    fetchOpenRiderJobs()
      .then((openRes) => setOpenJobs(openRes.jobs || []))
      .catch((e) => setErr(e.message));

    if (!canOperate || !riderId) {
      setMyJobs([]);
      setRepeatCustomers([]);
      return;
    }
    fetchRiderJobs(riderId, 'mine')
      .then((mineRes) => setMyJobs(mineRes.jobs || []))
      .catch((e) => setErr(e.message));
    setRepeatCustomers([]);
  }, [riderId, canOperate]);

  useEffect(() => {
    reload();
    const t = setInterval(reload, 12000);
    return () => clearInterval(t);
  }, [reload]);

  useEffect(() => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        setCurrentLocation({ lat, lng });
        if (riderId && online) {
          void sendRiderTelemetry(riderId, { lat, lng, online: true });
        }
      },
      () => {},
      { enableHighAccuracy: true, timeout: 12000 },
    );
  }, [riderId, online]);

  const listJobs = tab === 'open' ? openJobs : myJobs;
  const mapJobs = useMemo(
    () => riderJobsToMapJobs(tab === 'mine' ? myJobs : openJobs),
    [tab, openJobs, myJobs],
  );

  const acceptedJobRaw = useMemo(
    () => myJobs.find((j) => ['assigned', 'active'].includes(String(j.status))),
    [myJobs],
  );
  const acceptedMapJob = useMemo(
    () => (acceptedJobRaw ? riderJobsToMapJobs([acceptedJobRaw])[0] : null),
    [acceptedJobRaw],
  );

  const toggleOnline = async () => {
    const next = !online;
    setOnline(next);
    setSeeking(next);
    if (riderId) {
      try {
        await setRiderOnlineStatus(riderId, next);
      } catch {
        /* optional */
      }
    }
  };

  const accept = async (jobId: string) => {
    if (!riderId || !canOperate) {
      setErr('สมัครและเปิดใช้งาน Rider OS ก่อนรับงาน');
      return;
    }
    setBusy(jobId);
    setErr('');
    try {
      await acceptRiderJob(jobId, riderId);
      setTab('mine');
      await reload();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'รับงานไม่สำเร็จ');
    } finally {
      setBusy(null);
    }
  };

  const onMapJobSelect = (job: RiderMapJob) => {
    if (tab === 'open' && canOperate && online) {
      const raw = openJobs.find((j) => j.id === job.id);
      if (raw) void accept(raw.id);
    }
  };

  const confirmPin = () => {
    if (!draftPick) return;
    setPinnedLocation({ ...draftPick, address: 'จุดรับงานของคุณ' });
    setDraftPick(null);
    if (riderId) {
      void sendRiderTelemetry(riderId, {
        lat: draftPick.lat,
        lng: draftPick.lng,
        online: true,
      });
    }
  };

  const handleRepeatHire = (_c: RepeatCustomer) => {
    setErr('จ้างซ้ำ — ใช้งานได้เมื่อเชื่อม backend dispatch');
  };

  return (
    <div className="ros-cream-page">
      <div className="ros-cream-stack">
        <div className="ros-card ros-profile-row">
          <div className="ros-profile-meta">
            <p className="ros-profile-name">{profile?.display_name || riderName || 'ไรเดอร์'}</p>
            <p className="ros-profile-sub">
              {profile?.plate ? `ทะเบียน ${profile.plate}` : profile?.rider_id || riderId || '—'}
            </p>
          </div>
          <button
            type="button"
            className={`ros-online-btn${online ? ' on' : ''}`}
            disabled={!canOperate}
            onClick={() => void toggleOnline()}
          >
            ⚡ {online ? 'รับงานอยู่' : 'ปิดรับงาน'}
          </button>
        </div>

        <div className="ros-card ros-map-card">
          <ProviderRiderMap
            jobs={mapJobs}
            currentLocation={currentLocation}
            pinnedLocation={pinnedLocation}
            draftPickLocation={draftPick}
            onMapPick={(lat, lng) => setDraftPick({ lat, lng })}
            acceptedJob={acceptedMapJob}
            onJobSelect={onMapJobSelect}
            height="240px"
            jobSearchMode={seeking}
            radarOverlay={seeking && online}
            embedded
          />
        </div>

        {draftPick ? (
          <button type="button" className="ros-pin-confirm" onClick={confirmPin}>
            📍 ยืนยันจุดรับงานบนแผนที่
          </button>
        ) : null}

        <div className="ros-tabs">
          {(
            [
              ['open', 'งานว่าง'],
              ['mine', 'งานของฉัน'],
              ['repeat', 'จ้างซ้ำ'],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              className={`ros-tab${tab === id ? ' active' : ''}`}
              onClick={() => setTab(id)}
            >
              {label}
            </button>
          ))}
        </div>

        {err ? <p className="tt-error-inline">{err}</p> : null}

        {tab === 'repeat' ? (
          <div className="ros-job-list">
            {repeatCustomers.length === 0 ? (
              <p className="ros-card ros-empty">ยังไม่มีลูกค้าที่เคยจ้าง — ส่งงานสำเร็จแล้วจะแสดงที่นี่</p>
            ) : (
              repeatCustomers.map((c) => (
                <div key={`${c.buyer_id}-${c.last_job_id}`} className="ros-card ros-repeat-row">
                  <div className="ros-repeat-avatar">👤</div>
                  <div className="ros-repeat-body">
                    <p className="ros-job-title">{c.recipient_name || 'ลูกค้าเดิม'}</p>
                    <p className="ros-job-desc">
                      {c.address || c.merchant_name} · {c.trips || 1} ครั้ง
                    </p>
                  </div>
                  <button
                    type="button"
                    className="ros-repeat-btn"
                    disabled={!canOperate || busy != null}
                    onClick={() => handleRepeatHire(c)}
                  >
                    จ้างซ้ำ
                  </button>
                </div>
              ))
            )}
          </div>
        ) : (
          <div className="ros-job-list">
            {listJobs.length === 0 ? (
              <p className="ros-card ros-empty">
                {tab === 'open'
                  ? 'ยังไม่มีงานว่างในพื้นที่ — ลองเปิดรับงานและปักหมุดบนแผนที่'
                  : 'ยังไม่มีงานที่รับไว้'}
              </p>
            ) : (
              listJobs.map((job) => (
                <div key={job.id} className="ros-card ros-job-row">
                  <div className="ros-job-body">
                    <p className="ros-job-title">{job.merchant_name || 'งานส่งของ'}</p>
                    <p className="ros-job-desc">{job.items_summary || job.address}</p>
                    <p className="ros-job-price">
                      {job.phase} · {formatCatalogPrice(job.amount_micro || 0)}
                    </p>
                  </div>
                  {tab === 'open' && canOperate ? (
                    <button
                      type="button"
                      className="ros-accept-btn"
                      disabled={busy === job.id || !online}
                      onClick={() => void accept(job.id)}
                    >
                      {busy === job.id ? '…' : 'รับงาน'}
                    </button>
                  ) : (
                    <span className="ros-accepted-mark" aria-hidden>
                      ✓
                    </span>
                  )}
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}
