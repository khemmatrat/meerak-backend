'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { EmptyState } from '@aqond/ui';
import { formatCatalogPrice } from '@/lib/format';
import {
  acceptRiderJob,
  fetchOpenRiderJobs,
  fetchRiderDashboard,
  rejectRiderJob,
  sendRiderTelemetry,
  setRiderAvailability,
  type RiderAvailability,
  type RiderJob,
} from '@/lib/rider';
import { fetchRiderCredits } from '@/lib/orders';
import { computeRiderOnboarding } from '@/lib/riderOnboarding';
import { computeRiderAcceptStatus } from '@/lib/riderOperateStatus';
import { RiderFirstJobHint } from '@/components/mobile/RiderOnboardingProgress';
import { RiderAvailabilityControl } from '@/components/mobile/RiderAvailabilityControl';
import { RiderRejectJobSheet } from '@/components/mobile/RiderRejectJobSheet';
import { PARTNER_ACTIVATE } from '@/lib/authMessaging';
import { riderOsPath } from '@/lib/riderOsPaths';
import { disableRiderDevPreview } from '@/lib/riderDevPreview';
import { useRider } from '@/components/mobile/RiderShell';
import { useAuth } from '@/lib/auth';
import { fcmWebConfigured, registerRiderFcm } from '@/lib/fcmWeb';
import { AxsRiderLoading } from '@/components/axs/rider/AxsRiderLoading';
import {
  enrichJobWithGeo,
  formatDistanceKm,
  formatEta,
  sortJobsByDistance,
  type EnrichedRiderJob,
  type RiderGps,
} from '@/lib/riderJobGeo';
import {
  alertNewRiderJobs,
  dismissJobForSession,
  loadDismissedJobIds,
  showRiderJobToast,
} from '@/lib/riderJobAlerts';
import { RiderFaceVerifyModal } from '@/components/mobile/RiderFaceVerifyModal';
import { RiderJobOfferModal } from '@/components/mobile/RiderJobOfferModal';
import { useRiderFaceGate } from '@/lib/useRiderFaceGate';
import { getRiderDeviceFingerprint, loadRiderFaceSessionToken } from '@/lib/riderFaceDevice';

export default function RiderJobsPage() {
  const { riderId, canOperate, profileLoading, profile } = useRider();
  const { auth } = useAuth();
  const [rawJobs, setRawJobs] = useState<RiderJob[]>([]);
  const [jobSource, setJobSource] = useState('');
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [rejectJobId, setRejectJobId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [pushBusy, setPushBusy] = useState(false);
  const [pushOk, setPushOk] = useState(false);
  const [completedJobs, setCompletedJobs] = useState(0);
  const [availability, setAvailability] = useState<RiderAvailability>('offline');
  const [availBusy, setAvailBusy] = useState(false);
  const [availableCreditMicro, setAvailableCreditMicro] = useState<number | null>(null);
  const [riderGps, setRiderGps] = useState<RiderGps | null>(null);
  const [gpsReady, setGpsReady] = useState(false);
  const [gpsDenied, setGpsDenied] = useState(false);
  const [gpsLocating, setGpsLocating] = useState(false);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [offerJob, setOfferJob] = useState<EnrichedRiderJob | null>(null);
  const prevJobIdsRef = useRef<Set<string>>(new Set());
  const fcmReady = fcmWebConfigured();
  const gpsSupported = typeof navigator !== 'undefined' && !!navigator.geolocation;
  const online = availability !== 'offline';

  const faceGate = useRiderFaceGate(riderId, auth?.token);
  const [pendingAcceptJobId, setPendingAcceptJobId] = useState<string | null>(null);
  const [pendingAvailability, setPendingAvailability] = useState<RiderAvailability | null>(null);

  const onboarding = useMemo(
    () =>
      computeRiderOnboarding({
        hasAuth: !!auth?.userId,
        profile,
        completedJobs,
      }),
    [auth?.userId, profile, completedJobs],
  );

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
      faceGate.status,
    ],
  );

  const jobs = useMemo(() => {
    const enriched = rawJobs
      .filter((j) => !dismissed.has(j.id))
      .map((j) => enrichJobWithGeo(j, riderGps));
    return sortJobsByDistance(enriched);
  }, [rawJobs, riderGps, dismissed]);

  const suggestFirstJobId = useMemo(() => {
    if (!onboarding.steps.find((s) => s.id === 'first_job')?.done && jobs.length > 0) {
      return jobs[0]?.id || null;
    }
    return null;
  }, [jobs, onboarding.steps]);

  useEffect(() => {
    if (!riderId) return;
    setDismissed(loadDismissedJobIds(riderId));
  }, [riderId]);

  useEffect(() => {
    if (!auth?.userId || !profile?.rider_id) return;
    void fetchRiderCredits(profile.rider_id, auth.userId, 5, auth)
      .then((c) => {
        setCompletedJobs(c?.summary?.completed_jobs ?? 0);
        const s = c?.summary;
        setAvailableCreditMicro(
          s?.available_credit_micro ??
            Math.max(0, (s?.credit_limit_micro ?? 0) - (s?.credit_used_micro ?? 0)),
        );
      })
      .catch(() => {});
  }, [auth, profile?.rider_id]);

  useEffect(() => {
    if (!riderId) return;
    void fetchRiderDashboard(riderId).then((d) => {
      if (!d) return;
      setAvailability(d.availability ?? (d.online ? 'online' : 'offline'));
      setGpsReady(d.gps_ok ?? false);
      if (d.presence?.lat != null && d.presence?.lng != null) {
        setRiderGps({ lat: d.presence.lat, lng: d.presence.lng });
      }
    });
  }, [riderId]);

  useEffect(() => {
    disableRiderDevPreview();
  }, []);

  const pushGps = useCallback(
    (rider: string, pos: GeolocationPosition) => {
      const gps = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      setRiderGps(gps);
      setGpsReady(true);
      setGpsDenied(false);
      setGpsLocating(false);
      void sendRiderTelemetry(rider, {
        lat: gps.lat,
        lng: gps.lng,
        speed_kmh: pos.coords.speed != null ? pos.coords.speed * 3.6 : undefined,
        online: true,
      });
    },
    [],
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
    setAvailBusy(true);
    try {
      await setRiderAvailability(riderId, next, {
        face_session_token: loadRiderFaceSessionToken(),
        device_fingerprint: getRiderDeviceFingerprint(),
        lat: riderGps?.lat,
        lng: riderGps?.lng,
        user_id: auth?.userId,
      });
      setAvailability(next);
      if (next !== 'offline') requestGps();
    } finally {
      setAvailBusy(false);
    }
  };

  const pendingApproval =
    !profileLoading &&
    !!profile?.rider_id &&
    !canOperate;

  const reload = useCallback(() => {
    setLoading(true);
    setErr('');
    fetchOpenRiderJobs()
      .then((d) => {
        const list = d.jobs || [];
        const ids = new Set(list.map((j) => j.id));
        const prev = prevJobIdsRef.current;
        const newJobs = list.filter((j) => !prev.has(j.id));
        const newCount = newJobs.length;
        if (prev.size > 0 && newCount > 0 && acceptStatus.canAcceptJobs && online) {
          const enrichedNew = sortJobsByDistance(
            newJobs.map((j) => enrichJobWithGeo(j, riderGps)),
          );
          const top = enrichedNew[0];
          if (top && !dismissed.has(top.id)) {
            setOfferJob(top);
            const urgent =
              top.job_type === 'passenger' ||
              (top.amount_micro != null && top.amount_micro >= 500_000);
            const shop = top.merchant_name || 'ร้าน';
            alertNewRiderJobs(newCount, {
              urgent,
              speak: urgent
                ? `งานด่วน ไปรับที่ ${shop}`
                : `มีงานใหม่ ไปรับที่ ${shop}`,
            });
          } else {
            alertNewRiderJobs(newCount);
            showRiderJobToast(`มีงานใหม่ ${newCount} รายการ`);
          }
        }
        prevJobIdsRef.current = ids;
        setRawJobs(list);
        setJobSource(d.source || '');
        const visible = list.filter((j) => !dismissed.has(j.id));
        setSelectedId((prevSel) =>
          prevSel && visible.some((j) => j.id === prevSel) ? prevSel : visible[0]?.id || null,
        );
      })
      .catch((e) => setErr(e instanceof Error ? e.message : 'โหลดงานไม่สำเร็จ'))
      .finally(() => setLoading(false));
  }, [acceptStatus.canAcceptJobs, dismissed, online, riderGps]);

  useEffect(() => {
    reload();
    const t = setInterval(reload, 12000);
    return () => clearInterval(t);
  }, [reload]);

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
    if (!auth?.userId) {
      setErr('กรุณาเข้าสู่ระบบก่อนรับงาน');
      return;
    }
    if (!profile?.rider_id) {
      setErr('กรุณาสมัคร Rider OS ก่อนรับงาน');
      return;
    }
    if (!canOperate) {
      setErr('รอแอดมินอนุมัติ KYC หรือสมัครให้ครบก่อนรับงาน');
      return;
    }
    if (!acceptStatus.canAcceptJobs) {
      setErr('ยังไม่พร้อมรับงาน — ดูเหตุผลด้านบน');
      return;
    }
    if (!riderId) {
      setErr('ไม่พบ Rider ID — ลองรีเฟรชหรือสมัครใหม่');
      return;
    }
    const job = rawJobs.find((j) => j.id === jobId);
    if (job && !faceGate.ensureForJob(job)) {
      setPendingAcceptJobId(jobId);
      return;
    }
    setBusy(jobId);
    setErr('');
    try {
      await acceptRiderJob(jobId, riderId, {
        face_session_token: loadRiderFaceSessionToken(),
        device_fingerprint: getRiderDeviceFingerprint(),
        lat: riderGps?.lat,
        lng: riderGps?.lng,
        job_type: job?.job_type,
        payment_method: job?.payment_method,
        amount_micro: job?.amount_micro,
        user_id: auth.userId,
      });
      window.location.href = riderOsPath(`/active/${jobId}`);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'รับงานไม่สำเร็จ');
    } finally {
      setBusy(null);
    }
  };

  const reject = async (reasonId: string) => {
    if (!rejectJobId || !riderId) return;
    setBusy(rejectJobId);
    setErr('');
    try {
      await rejectRiderJob(rejectJobId, riderId, reasonId);
      dismissJobForSession(riderId, rejectJobId);
      setDismissed((prev) => new Set([...prev, rejectJobId]));
      setRejectJobId(null);
      setRawJobs((prev) => prev.filter((j) => j.id !== rejectJobId));
      showRiderJobToast('ปฏิเสธงานแล้ว');
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'ปฏิเสธงานไม่สำเร็จ');
    } finally {
      setBusy(null);
    }
  };

  const gpsChipLabel = (() => {
    if (!canOperate || !riderId || !online) return null;
    if (!gpsSupported) return 'ไม่มี GPS';
    if (gpsDenied) return 'ไม่อนุญาตตำแหน่ง';
    if (gpsReady) return 'ตำแหน่งพร้อม';
    return 'กำลังหาตำแหน่ง…';
  })();

  const renderJobCard = (j: EnrichedRiderJob, actionsDisabled?: boolean) => (
    <article
      key={j.id}
      className={`tt-rider-job-card${selectedId === j.id ? ' selected' : ''}${j.id === suggestFirstJobId ? ' tt-rider-job-card--suggested' : ''}`}
      onClick={() => setSelectedId(j.id)}
    >
      <div className="tt-rider-job-top">
        <strong>#{j.order_id.slice(-8)}</strong>
        {j.id === suggestFirstJobId && (
          <span className="tt-rider-job-suggest-badge">แนะนำงานแรก</span>
        )}
        <span>{j.payment_method?.toUpperCase() || j.job_type?.toUpperCase() || 'COD'}</span>
      </div>
      <p className="tt-rider-job-shop">{j.merchant_name || j.merchant_id}</p>
      {j.items_summary && <p className="tt-rider-job-meta">{j.items_summary}</p>}
      {j.address && <p className="tt-rider-job-addr">📍 {j.address}</p>}
      <div className="tt-rider-job-geo">
        <span title="ระยะไปร้าน">🛵 {formatDistanceKm(j.distance_km)}</span>
        <span title="ETA ไปร้าน">🏪 {formatEta(j.eta_pickup_min)}</span>
        <span title="ETA ส่งครบ">📦 {formatEta(j.eta_total_min)}</span>
        <span title="ค่าจ้างโดยประมาณ" className="tt-rider-job-earn">
          ~{formatCatalogPrice(j.estimated_earning_micro || 0)}
        </span>
      </div>
      <div className="tt-rider-job-foot">
        <strong>{formatCatalogPrice(j.amount_micro || 0)}</strong>
        <div className="tt-rider-job-actions">
          {!actionsDisabled && (
            <button
              type="button"
              className="tt-rider-reject-btn"
              disabled={busy === j.id}
              onClick={(e) => {
                e.stopPropagation();
                setRejectJobId(j.id);
              }}
            >
              ปฏิเสธ
            </button>
          )}
          <button
            type="button"
            className="tt-rider-accept-btn"
            disabled={busy === j.id || actionsDisabled || !canOperate || !riderId}
            onClick={(e) => {
              e.stopPropagation();
              void accept(j.id);
            }}
          >
            {busy === j.id ? '…' : actionsDisabled ? 'รอ KYC' : 'รับงาน'}
          </button>
        </div>
      </div>
    </article>
  );

  if (pendingApproval) {
    return (
      <div className="tt-rider-jobs-premium">
        <EmptyState
          icon="🛡️"
          title="รอการอนุมัติ"
          description="ทีม AQOND กำลังตรวจสอบ KYC — งานด้านล่างเป็นของจริง รับได้เมื่ออนุมัติแล้ว"
        />
        {auth && fcmReady && !pushOk && (
          <button type="button" className="tt-rider-push-btn" disabled={pushBusy} onClick={() => void enablePush()}>
            {pushBusy ? 'กำลังเปิด Push…' : '🔔 แจ้งเตือนเมื่ออนุมัติ'}
          </button>
        )}
        {err && <p className="tt-error-inline">{err}</p>}
        {!loading && jobs.length > 0 && (
          <>
            <p className="tt-hint" style={{ margin: '12px 0' }}>
              {jobs.length} งานเปิดรอรับ{jobSource ? ` · ${jobSource}` : ''}
            </p>
            <div className="tt-rider-job-cards">{jobs.map((j) => renderJobCard(j, true))}</div>
          </>
        )}
      </div>
    );
  }

  const needsSignup = !profileLoading && auth?.userId && !profile?.rider_id;

  return (
    <div className="tt-rider-jobs-premium">
      <div className="tt-rider-section-head">
        <h2>
          <span className="tt-rider-pulse" />
          งานใกล้ฉัน
        </h2>
        <Link href={riderOsPath('/mine')} className="tt-rider-link">ดูงานที่รับแล้ว →</Link>
      </div>

      {canOperate && riderId && (
        <RiderAvailabilityControl
          riderId={riderId}
          canOperate={canOperate}
          availability={availability}
          busy={availBusy}
          acceptStatus={acceptStatus}
          gpsChipLabel={gpsChipLabel}
          gpsReady={gpsReady}
          onChange={(next) => void changeAvailability(next)}
          compact
        />
      )}

      {needsSignup && (
        <Link href={riderOsPath('/signup')} className="tt-rider-kyc-btn" style={{ marginBottom: 12 }}>
          🛡️ {PARTNER_ACTIVATE.delivery} — สมัครก่อนรับงาน
        </Link>
      )}

      {!auth?.userId && (
        <Link href={`/m/login?next=${encodeURIComponent(riderOsPath('/jobs'))}`} className="tt-rider-kyc-btn" style={{ marginBottom: 12 }}>
          เข้าสู่ระบบเพื่อรับงาน
        </Link>
      )}

      {auth && fcmReady && !pushOk && canOperate && (
        <button type="button" className="tt-rider-push-btn" disabled={pushBusy} onClick={() => void enablePush()}>
          {pushBusy ? 'กำลังเปิด Push…' : '🔔 เปิด Push งานใหม่'}
        </button>
      )}

      {loading && (
        <AxsRiderLoading label="กำลังค้นหางานใหม่ในพื้นที่…" />
      )}

      {err && <p className="tt-error-inline">{err}</p>}

      {!loading && jobs.length === 0 && (
        <EmptyState
          icon="📋"
          title="ยังไม่มีงานเปิด"
          description="เมื่อลูกค้าสั่งอาหาร/บริการส่ง งานจะปรากฏที่นี่ทันที — เรียงตามระยะจากตำแหน่งคุณ"
        />
      )}

      {!loading && jobs.length > 0 && jobSource && (
        <p className="tt-hint" style={{ marginBottom: 8 }}>
          {riderGps ? 'เรียงตามระยะใกล้คุณ · ' : ''}
          {jobs.length} รายการ · {jobSource}
        </p>
      )}

      {!loading && jobs.length > 0 && suggestFirstJobId && (
        <RiderFirstJobHint jobCount={jobs.length} />
      )}

      <div className="tt-rider-job-cards">
        {jobs.map((j) => renderJobCard(j))}
      </div>

      <RiderRejectJobSheet
        open={!!rejectJobId}
        busy={!!busy && busy === rejectJobId}
        onClose={() => setRejectJobId(null)}
        onConfirm={(reason) => void reject(reason)}
      />

      {offerJob && (
        <RiderJobOfferModal
          job={offerJob}
          busy={busy === offerJob.id}
          onAccept={() => {
            const id = offerJob.id;
            setOfferJob(null);
            void accept(id);
          }}
          onReject={() => {
            const id = offerJob.id;
            setOfferJob(null);
            if (riderId) {
              void rejectRiderJob(id, riderId, 'offer_declined').catch(() => {});
              dismissJobForSession(riderId, id);
            }
            setDismissed((prev) => new Set([...prev, id]));
            showRiderJobToast('ปฏิเสธงานแล้ว');
          }}
          onTimeout={() => {
            setOfferJob(null);
            showRiderJobToast('หมดเวลารับงาน');
          }}
        />
      )}

      {profile?.rider_id && (
        <Link href={riderOsPath('/signup')} className="tt-rider-link" style={{ display: 'block', marginTop: 12, fontSize: '0.8rem' }}>
          อัปเดตข้อมูล / เอกสาร KYC →
        </Link>
      )}

      <RiderFaceVerifyModal
        open={faceGate.verifyOpen}
        riderId={riderId || ''}
        purpose={faceGate.verifyPurpose}
        authToken={auth?.token}
        lat={riderGps?.lat}
        lng={riderGps?.lng}
        verifyLevel={faceGate.status?.verify_level}
        strictIntervalDays={faceGate.status?.strict_interval_days ?? 3}
        onClose={() => {
          setPendingAcceptJobId(null);
          setPendingAvailability(null);
          faceGate.closeVerify();
        }}
        onVerified={(token) => {
          faceGate.onVerified(token);
          const jid = pendingAcceptJobId;
          const nextAvail = pendingAvailability;
          setPendingAcceptJobId(null);
          setPendingAvailability(null);
          if (nextAvail) void changeAvailability(nextAvail);
          else if (jid) void accept(jid);
        }}
      />
    </div>
  );
}
