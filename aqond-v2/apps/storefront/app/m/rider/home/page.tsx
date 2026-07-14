'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { StatusChip } from '@aqond/ui';
import { formatCatalogPrice } from '@/lib/format';
import {
  fetchRiderDashboard,
  fetchRiderJobs,
  setRiderOnlineStatus,
  sendRiderTelemetry,
} from '@/lib/rider';
import { useRider } from '@/components/mobile/RiderShell';
import { AxsRiderHomeLoading } from '@/components/axs/rider/AxsRiderLoading';

export default function RiderHomePage() {
  const { riderId, canOperate, profile, riderName } = useRider();
  const [dash, setDash] = useState<Awaited<ReturnType<typeof fetchRiderDashboard>>>(null);
  const [dashLoading, setDashLoading] = useState(!!riderId);
  const [online, setOnline] = useState(false);
  const [gpsOk, setGpsOk] = useState(false);
  const [busy, setBusy] = useState(false);
  const [openCount, setOpenCount] = useState(0);

  const reload = useCallback(async () => {
    if (!riderId) {
      setDashLoading(false);
      return;
    }
    setDashLoading(true);
    try {
      const [d, jobs] = await Promise.all([
        fetchRiderDashboard(riderId),
        canOperate ? fetchRiderJobs(riderId, 'open').catch(() => ({ jobs: [] })) : Promise.resolve({ jobs: [] }),
      ]);
      setDash(d);
      setOnline(d?.online ?? false);
      setGpsOk(d?.gps_ok ?? false);
      setOpenCount(jobs.jobs?.length || 0);
    } finally {
      setDashLoading(false);
    }
  }, [riderId, canOperate]);

  useEffect(() => {
    void reload();
    const t = setInterval(() => void reload(), 15000);
    return () => clearInterval(t);
  }, [reload]);

  useEffect(() => {
    if (!riderId || !online) return;
    if (!navigator.geolocation) return;
    const tick = () => {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setGpsOk(true);
          void sendRiderTelemetry(riderId, {
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
            speed_kmh: pos.coords.speed != null ? pos.coords.speed * 3.6 : undefined,
            online: true,
            current_job_id: dash?.current_job?.id,
          });
        },
        () => setGpsOk(false),
        { enableHighAccuracy: false, maximumAge: 20000 },
      );
      const batt = (navigator as Navigator & { getBattery?: () => Promise<{ level: number }> }).getBattery;
      if (batt) {
        void batt().then((b) => {
          void sendRiderTelemetry(riderId, { battery_pct: Math.round(b.level * 100), online: true });
        });
      }
    };
    tick();
    const t = setInterval(tick, 25000);
    return () => clearInterval(t);
  }, [riderId, online, dash?.current_job?.id]);

  const toggleOnline = async () => {
    if (!riderId || !canOperate) return;
    setBusy(true);
    try {
      await setRiderOnlineStatus(riderId, !online);
      setOnline(!online);
      await reload();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="tt-rider-home">
      {dashLoading && riderId && <AxsRiderHomeLoading />}

      {!dashLoading && (
        <>
      <div className="tt-rider-home-hero">
        <p className="tt-rider-home-greet">สวัสดี, {riderName}</p>
        <div className="tt-rider-online-row axs-rider-status-row">
          <button
            type="button"
            className={`tt-rider-online-toggle${online ? ' on' : ''}`}
            disabled={!canOperate || busy}
            onClick={() => void toggleOnline()}
          >
            <span className="tt-rider-online-dot" />
            {online ? 'ออนไลน์ — รับงานได้' : 'ออฟไลน์'}
          </button>
          <StatusChip tone={gpsOk ? 'online' : 'offline'} live={gpsOk && online}>
            {gpsOk ? 'GPS พร้อม' : 'รอ GPS'}
          </StatusChip>
          {online && (
            <StatusChip tone="active" live>
              รับงาน
            </StatusChip>
          )}
        </div>
      </div>

      {dash && (
        <div className="tt-rider-stat-grid">
          <div className="tt-rider-stat-card">
            <span>รายได้วันนี้</span>
            <strong>{formatCatalogPrice(dash.today.earnings_micro)}</strong>
          </div>
          <div className="tt-rider-stat-card">
            <span>เที่ยวสำเร็จ</span>
            <strong>{dash.today.trips}</strong>
          </div>
          <div className="tt-rider-stat-card">
            <span>อัตรารับงาน</span>
            <strong>{dash.today.acceptance_rate}%</strong>
          </div>
          <div className="tt-rider-stat-card">
            <span>ยกเลิก</span>
            <strong>{dash.today.cancel_rate}%</strong>
          </div>
        </div>
      )}

      {dash?.current_job && (
        <Link href={`/m/rider/active/${dash.current_job.id}`} className="tt-rider-active-banner">
          <span>🛵 งานปัจจุบัน</span>
          <strong>#{dash.current_job.order_id.slice(-8)} · {dash.current_job.phase}</strong>
          <span className="tt-rider-link">ดำเนินการ →</span>
        </Link>
      )}

      <div className="tt-rider-quick-actions">
        <Link href="/m/rider/jobs" className="tt-rider-quick-card">
          <span>📋</span>
          <strong>รับงาน</strong>
          <p>{openCount} งานเปิด</p>
        </Link>
        <Link href="/m/rider/mine" className="tt-rider-quick-card">
          <span>📦</span>
          <strong>งานของฉัน</strong>
          <p>{dash?.today.active_jobs || 0} กำลังส่ง</p>
        </Link>
        <Link href="/m/rider/map" className="tt-rider-quick-card">
          <span>🗺️</span>
          <strong>แผนที่</strong>
          <p>งานรอบตัว</p>
        </Link>
        <Link href="/m/rider/wallet" className="tt-rider-quick-card">
          <span>💰</span>
          <strong>กระเป๋า</strong>
          <p>{formatCatalogPrice(dash?.wallet.withdrawable_micro || 0)}</p>
        </Link>
      </div>

      {!canOperate && profile && (
        <p className="tt-hint">รอแอดมินอนุมัติ KYC ก่อนเปิดออนไลน์และรับงาน</p>
      )}
        </>
      )}
    </div>
  );
}
