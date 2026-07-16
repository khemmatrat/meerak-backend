'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { formatCatalogPrice } from '@/lib/format';
import { useAuth } from '@/lib/auth';
import {
  fetchRiderDashboard,
  fetchOpenRiderJobs,
  setRiderAvailability,
  sendRiderTelemetry,
  type RiderAvailability,
} from '@/lib/rider';
import { fetchRiderCredits } from '@/lib/orders';
import { computeRiderAcceptStatus } from '@/lib/riderOperateStatus';
import { computeRiderOnboarding } from '@/lib/riderOnboarding';
import { RiderOnboardingProgress } from '@/components/mobile/RiderOnboardingProgress';
import { RiderAvailabilityControl } from '@/components/mobile/RiderAvailabilityControl';
import { RiderCreditLowBanner } from '@/components/mobile/RiderCreditLowBanner';
import { RiderRetentionCard } from '@/components/mobile/RiderRetentionCard';
import { RiderMissionsCard } from '@/components/mobile/RiderMissionsCard';
import { RiderLeaderboardCard } from '@/components/mobile/RiderLeaderboardCard';
import { formatAcceptanceRate } from '@/lib/riderRetention';
import { enrichJobWithGeo, sortJobsByDistance } from '@/lib/riderJobGeo';
import { alertNearbyRiderJob } from '@/lib/riderJobAlerts';
import { riderOsPath } from '@/lib/riderOsPaths';
import { useRider } from '@/components/mobile/RiderShell';
import { AxsRiderHomeLoading } from '@/components/axs/rider/AxsRiderLoading';
import { RIDER_OS_QUICK_ACTIONS, RiderOsIcon } from '@/components/mobile/RiderOsIcons';
import { RiderFaceVerifyModal } from '@/components/mobile/RiderFaceVerifyModal';
import { useRiderFaceGate } from '@/lib/useRiderFaceGate';
import { getRiderDeviceFingerprint, loadRiderFaceSessionToken } from '@/lib/riderFaceDevice';

export default function RiderHomePage() {
  const { auth } = useAuth();
  const { riderId, canOperate, profile, riderName, profileLoading } = useRider();
  const [dash, setDash] = useState<Awaited<ReturnType<typeof fetchRiderDashboard>>>(null);
  const [dashLoading, setDashLoading] = useState(true);
  const [availability, setAvailability] = useState<RiderAvailability>('offline');
  const online = availability !== 'offline';
  const [gpsReady, setGpsReady] = useState(false);
  const [gpsDenied, setGpsDenied] = useState(false);
  const [gpsLocating, setGpsLocating] = useState(false);
  const [busy, setBusy] = useState(false);
  const [openCount, setOpenCount] = useState(0);
  const [availableCreditMicro, setAvailableCreditMicro] = useState<number | null>(null);
  const [creditLimitMicro, setCreditLimitMicro] = useState<number | null>(null);
  const [completedJobs, setCompletedJobs] = useState<number | null>(null);

  const gpsSupported = typeof navigator !== 'undefined' && !!navigator.geolocation;

  const faceGate = useRiderFaceGate(riderId, auth?.token);
  const [pendingAvailability, setPendingAvailability] = useState<RiderAvailability | null>(null);

  const acceptStatus = useMemo(
    () =>
      computeRiderAcceptStatus({
        hasAuth: !!auth?.userId,
        profile,
        profileLoading,
        online,
        availability,
        gpsSupported,
        gpsDenied,
        gpsReady,
        gpsLocating,
        availableCreditMicro,
        hasActiveJob: !!dash?.current_job,
        faceSession: faceGate.status,
      }),
    [
      auth?.userId,
      profile,
      profileLoading,
      online,
      availability,
      gpsSupported,
      gpsDenied,
      gpsReady,
      gpsLocating,
      availableCreditMicro,
      dash?.current_job,
      faceGate.status,
    ],
  );

  const onboarding = useMemo(
    () =>
      computeRiderOnboarding({
        hasAuth: !!auth?.userId,
        profile,
        creditLimitMicro,
        completedJobs,
      }),
    [auth?.userId, profile, creditLimitMicro, completedJobs],
  );

  const reload = useCallback(async () => {
    setDashLoading(true);
    try {
      const jobsP = fetchOpenRiderJobs().catch(() => ({ jobs: [] as { id: string }[] }));
      if (!riderId) {
        const jobs = await jobsP;
        setOpenCount(jobs.jobs?.length || 0);
        setDash(null);
        setAvailability('offline');
        setAvailableCreditMicro(null);
        setCreditLimitMicro(null);
        setCompletedJobs(null);
        return;
      }
      const [d, jobs, credits] = await Promise.all([
        fetchRiderDashboard(riderId),
        jobsP,
        fetchRiderCredits(riderId, auth?.userId, 5, auth).catch(() => null),
      ]);
      setDash(d);
      setAvailability(d?.availability ?? (d?.online ? 'online' : 'offline'));
      setGpsReady(d?.gps_ok ?? false);
      setOpenCount(jobs.jobs?.length || 0);
      const s = credits?.summary;
      setCreditLimitMicro(s?.credit_limit_micro ?? null);
      setCompletedJobs(s?.completed_jobs ?? d?.today?.trips ?? null);
      setAvailableCreditMicro(
        s?.available_credit_micro ??
          Math.max(0, (s?.credit_limit_micro ?? 0) - (s?.credit_used_micro ?? 0)),
      );

      if (
        canOperate &&
        d?.presence?.lat != null &&
        d?.presence?.lng != null &&
        jobs.jobs?.length
      ) {
        const avail = d.availability ?? (d.online ? 'online' : 'offline');
        if (avail === 'online') {
          const gps = { lat: d.presence.lat, lng: d.presence.lng };
          const nearest = sortJobsByDistance(
            jobs.jobs.map((j) => enrichJobWithGeo(j as Parameters<typeof enrichJobWithGeo>[0], gps)),
          )[0];
          if (
            nearest?.estimated_earning_micro &&
            nearest.distance_km != null &&
            nearest.distance_km <= 8
          ) {
            alertNearbyRiderJob(nearest.estimated_earning_micro, nearest.distance_km);
          }
        }
      }
    } finally {
      setDashLoading(false);
    }
  }, [riderId, auth, canOperate]);

  const acceptanceCopy = useMemo(
    () => (dash ? formatAcceptanceRate(dash.today.acceptance_rate) : null),
    [dash],
  );

  const pushGps = useCallback(
    (rider: string, pos: GeolocationPosition) => {
      setGpsReady(true);
      setGpsDenied(false);
      setGpsLocating(false);
      void sendRiderTelemetry(rider, {
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
        speed_kmh: pos.coords.speed != null ? pos.coords.speed * 3.6 : undefined,
        online: true,
        current_job_id: dash?.current_job?.id,
      });
    },
    [dash?.current_job?.id],
  );

  const requestGps = useCallback(() => {
    if (!gpsSupported || !riderId) return;
    setGpsLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => pushGps(riderId, pos),
      (err) => {
        setGpsLocating(false);
        setGpsReady(false);
        setGpsDenied(err.code === err.PERMISSION_DENIED);
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 10000 },
    );
  }, [gpsSupported, pushGps, riderId]);

  useEffect(() => {
    void reload();
    const t = setInterval(() => void reload(), 15000);
    return () => clearInterval(t);
  }, [reload]);

  useEffect(() => {
    if (!riderId || !online || !canOperate) return;
    requestGps();
    const t = setInterval(requestGps, 25000);
    return () => clearInterval(t);
  }, [riderId, online, canOperate, requestGps]);

  const changeAvailability = async (next: RiderAvailability) => {
    if (!riderId || !canOperate) return;
    if (next === 'online' && !faceGate.ensureOnline()) {
      setPendingAvailability(next);
      return;
    }
    setBusy(true);
    try {
      await setRiderAvailability(riderId, next, {
        face_session_token: loadRiderFaceSessionToken(),
        device_fingerprint: getRiderDeviceFingerprint(),
        lat: dash?.presence?.lat,
        lng: dash?.presence?.lng,
        user_id: auth?.userId,
      });
      setAvailability(next);
      if (next !== 'offline') {
        setGpsLocating(true);
        requestGps();
      } else {
        setGpsReady(false);
        setGpsLocating(false);
        setGpsDenied(false);
      }
      await reload();
    } finally {
      setBusy(false);
    }
  };

  const gpsHint = (() => {
    if (!canOperate || !riderId) return null;
    if (!gpsSupported) return 'อุปกรณ์นี้ไม่รองรับ GPS';
    if (!online) return 'เมื่อเปิดออนไลน์ ระบบจะใช้ตำแหน่งของคุณจับคู่งานใกล้เคียง';
    if (gpsDenied) return 'กรุณาอนุญาต「ตำแหน่งที่ตั้ง」ในเบราว์เซอร์/แอป แล้วรีเฟรช';
    if (gpsLocating || !gpsReady) return 'กำลังใช้ GPS หาตำแหน่งของคุณ…';
    return 'ระบบเห็นตำแหน่งของคุณแล้ว — พร้อมรับงานรอบตัว';
  })();

  const gpsChipLabel = (() => {
    if (!canOperate || !riderId || !online) return null;
    if (!gpsSupported) return 'ไม่มี GPS';
    if (gpsDenied) return 'ไม่อนุญาตตำแหน่ง';
    if (gpsReady) return 'ตำแหน่งพร้อม';
    return 'กำลังหาตำแหน่ง…';
  })();

  const showOnboarding = !profileLoading && !profile?.rider_id;

  return (
    <div className="tt-rider-home">
      {dashLoading && <AxsRiderHomeLoading />}

      {!dashLoading && (
        <>
      {!onboarding.completed && (
        <RiderOnboardingProgress state={onboarding} className="tt-rider-home-onboard-progress" />
      )}

      {availableCreditMicro != null && creditLimitMicro != null && creditLimitMicro > 0 && (
        <RiderCreditLowBanner
          availableMicro={availableCreditMicro}
          limitMicro={creditLimitMicro}
          compact
          className="tt-rider-home-credit-low"
        />
      )}

      <div className="tt-rider-home-hero">
        <p className="tt-rider-home-greet">สวัสดี, {riderName}</p>
        <div className="tt-rider-online-row axs-rider-status-row">
          <RiderAvailabilityControl
            riderId={riderId}
            canOperate={canOperate}
            availability={availability}
            busy={busy}
            acceptStatus={acceptStatus}
            gpsChipLabel={gpsChipLabel}
            gpsReady={gpsReady}
            onChange={(next) => void changeAvailability(next)}
          />
        </div>
        {gpsHint && (
          <p className="tt-rider-home-gps-hint">{gpsHint}</p>
        )}
        {showOnboarding && (
          <p className="tt-rider-home-gps-hint">
            GPS ใช้เมื่อเปิดออนไลน์เท่านั้น — เพื่อให้ระบบจับคู่งานส่งใกล้คุณ
          </p>
        )}
      </div>

      {showOnboarding && !auth?.userId && (
        <div className="tt-rider-home-onboard">
          <p className="tt-rider-home-onboard-title">เริ่มรับงานส่งใน 3 นาที</p>
          <p className="tt-rider-onboard-credit-pitch">{onboarding.creditPitch}</p>
          <Link href={`/m/login?next=${encodeURIComponent(riderOsPath('/signup'))}`} className="tt-rider-home-onboard-cta">
            เข้าสู่ระบบแล้วสมัคร →
          </Link>
        </div>
      )}

      {onboarding.currentStepId === 'first_job' && canOperate && openCount > 0 && (
        <Link href={riderOsPath('/jobs')} className="tt-rider-guided-first-job">
          <span>🛵 ลองรับงานแรก</span>
          <strong>{openCount} งานเปิดรอคุณอยู่</strong>
          <span className="tt-rider-link">ไปเลือกงาน →</span>
        </Link>
      )}

      {dash && canOperate && (
        <RiderRetentionCard
          weekTrips={dash.week?.trips ?? dash.today.trips}
          weekEarningsMicro={dash.week?.earnings_micro ?? dash.today.earnings_micro}
          streakDays={dash.retention?.streak_days ?? 0}
          acceptanceRate={dash.today.acceptance_rate}
          completedTrips={dash.retention?.completed_trips ?? completedJobs ?? 0}
          avgRating={dash.retention?.avg_rating}
        />
      )}

      {dash && canOperate && (
        <RiderMissionsCard
          weekTrips={dash.week?.trips ?? dash.today.trips}
          streakDays={dash.retention?.streak_days ?? 0}
          acceptanceRate={dash.today.acceptance_rate}
          completedTrips={dash.retention?.completed_trips ?? completedJobs ?? 0}
        />
      )}

      {dash && canOperate && (
        <RiderLeaderboardCard
          riderName={riderName || undefined}
          weekTrips={dash.week?.trips ?? dash.today.trips}
          weekEarningsMicro={dash.week?.earnings_micro ?? dash.today.earnings_micro}
        />
      )}

      {dash && (
        <div className="tt-rider-stat-grid">
          <div className="tt-rider-stat-card">
            <span>รายได้วันนี้</span>
            <strong>{formatCatalogPrice(dash.today.earnings_micro)}</strong>
          </div>
          <div className="tt-rider-stat-card">
            <span>เที่ยวสำเร็จวันนี้</span>
            <strong>{dash.today.trips}</strong>
          </div>
          <div className={`tt-rider-stat-card tt-rider-stat-card--accept-${acceptanceCopy?.tone || 'ok'}`}>
            <span>อัตรารับงาน</span>
            <strong>{dash.today.acceptance_rate}%</strong>
            {acceptanceCopy && (
              <p className="tt-rider-stat-sub">{acceptanceCopy.headline.split(' — ')[1] || ''}</p>
            )}
          </div>
          <div className="tt-rider-stat-card">
            <span>ยกเลิก</span>
            <strong>{dash.today.cancel_rate}%</strong>
          </div>
        </div>
      )}

      {dash?.current_job && (
        <Link href={riderOsPath(`/active/${dash.current_job.id}`)} className="tt-rider-active-banner">
          <span>🛵 งานปัจจุบัน</span>
          <strong>#{dash.current_job.order_id.slice(-8)} · {dash.current_job.phase}</strong>
          <span className="tt-rider-link">ดำเนินการ →</span>
        </Link>
      )}

      <div className="tt-rider-quick-actions">
        {RIDER_OS_QUICK_ACTIONS.map((action) => {
          const subtitle =
            action.hrefKey === '/jobs'
              ? `${openCount} งานเปิด`
              : action.hrefKey === '/mine'
                ? `${dash?.today.active_jobs || 0} กำลังส่ง`
                : action.hrefKey === '/map'
                  ? 'งานรอบตัว'
                  : formatCatalogPrice(dash?.wallet.withdrawable_micro || 0);

          return (
            <Link key={action.hrefKey} href={riderOsPath(action.hrefKey)} className="tt-rider-quick-card">
              <span className="tt-rider-quick-card-icon">
                <RiderOsIcon name={action.icon} size={22} />
              </span>
              <strong>{action.label}</strong>
              <p>{subtitle}</p>
            </Link>
          );
        })}
      </div>

      {!canOperate && profile?.rider_id && (
        <p className="tt-hint">รอแอดมินอนุมัติ KYC แล้วเปิดออนไลน์เพื่อรับงาน — ดูงานเปิดได้ที่แท็บ「รับงาน」</p>
      )}
        </>
      )}
      <RiderFaceVerifyModal
        open={faceGate.verifyOpen}
        riderId={riderId || ''}
        purpose={faceGate.verifyPurpose}
        authToken={auth?.token}
        lat={dash?.presence?.lat}
        lng={dash?.presence?.lng}
        verifyLevel={faceGate.status?.verify_level}
        strictIntervalDays={faceGate.status?.strict_interval_days ?? 3}
        onClose={() => {
          setPendingAvailability(null);
          faceGate.closeVerify();
        }}
        onVerified={(token) => {
          faceGate.onVerified(token);
          const next = pendingAvailability;
          setPendingAvailability(null);
          if (next) void changeAvailability(next);
        }}
      />
    </div>
  );
}
