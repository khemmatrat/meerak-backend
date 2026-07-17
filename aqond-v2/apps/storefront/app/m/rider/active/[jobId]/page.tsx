'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import {
  advanceRiderJob,
  fetchRiderJobById,
  nextRiderAction,
  sendRiderGps,
  sendRiderTelemetry,
  riderPhaseLabel,
  verifyRiderPickup,
  uploadRiderPickupPhoto,
} from '@/lib/rider';
import { isFoodPickupQrRequired } from '@/lib/riderPickupFlow';
import { riderFlowStage } from '@/lib/riderPhaseFlow';
import { requiresDeliveryPhoto, formatProofTimestamp } from '@/lib/riderDeliveryProof';
import { useRider } from '@/components/mobile/RiderShell';
import { RiderActiveNavMap } from '@/components/mobile/RiderActiveNavMap';
import { RiderActiveBottomSheet } from '@/components/mobile/RiderActiveBottomSheet';
import {
  RiderContactCustomerIcon,
  RiderContactHelpIcon,
  RiderContactMerchantIcon,
} from '@/components/mobile/RiderActiveContactIcons';
import { isRiderNavFullscreen } from '@/lib/riderNavExternal';
import { RiderProofCameraSheet } from '@/components/mobile/RiderProofCameraSheet';
import { RiderQrScanner } from '@/components/mobile/RiderQrScanner';
import { RiderSosButton } from '@/components/mobile/RiderSosButton';
import { RiderIssueSheet } from '@/components/mobile/RiderIssueSheet';
import { RiderCodCollectPanel } from '@/components/mobile/RiderCodCollectPanel';
import { TtRiderChatSheet } from '@/components/mobile/TtRiderChatSheet';
import { RiderShopChatSheet } from '@/components/mobile/RiderShopChatSheet';
import { RiderHelpCenterOverlay } from '@/components/mobile/RiderHelpCenterOverlay';
import { RIDER_OS_MARKER_SRC } from '@/lib/riderBrandIcon';
import { ensureFoodRiderTracking } from '@/lib/foodTracking';
import { formatDispatchOrderReferenceCode } from '@/lib/orderDisplayCode';
import { riderShopChatHref } from '@/lib/shopChat';
import { useAuth } from '@/lib/auth';
import type { RiderTrackingView, ChatMessage } from '@/lib/server/riderTracking';

type RiderJob = {
  id: string;
  order_id: string;
  merchant_id?: string;
  status: string;
  phase: string;
  merchant_name?: string;
  items_summary?: string;
  address?: string;
  customer_phone?: string;
  recipient_name?: string;
  amount_micro?: number;
  payment_method?: string;
  job_type?: string;
  pickup_lat?: number;
  pickup_lng?: number;
  dropoff_lat?: number;
  dropoff_lng?: number;
  delivery_proof_url?: string;
  delivery_proof_at?: string;
  delivery_proof_lat?: number;
  delivery_proof_lng?: number;
  updated_at?: string;
};

export default function RiderActiveJobPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const embed = searchParams.get('embed') === '1';
  const jobId = String(params.jobId || '');
  const { riderId, profileLoading } = useRider();
  const [job, setJob] = useState<RiderJob | null>(null);
  const [loadState, setLoadState] = useState<'loading' | 'ready' | 'missing'>('loading');
  const [tracking, setTracking] = useState<RiderTrackingView | null>(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const { auth } = useAuth();
  const [customerChatOpen, setCustomerChatOpen] = useState(false);
  const [merchantChatOpen, setMerchantChatOpen] = useState(false);
  const [helpCenterOpen, setHelpCenterOpen] = useState(false);
  const [helpCenterTab, setHelpCenterTab] = useState<'chat' | 'help'>('help');
  const [photoPreview, setPhotoPreview] = useState('');
  const [riderPos, setRiderPos] = useState<{ lat: number; lng: number } | null>(null);
  const [issueOpen, setIssueOpen] = useState(false);
  const [justCompleted, setJustCompleted] = useState(false);
  const [proofCameraOpen, setProofCameraOpen] = useState(false);
  const [pickupCameraOpen, setPickupCameraOpen] = useState(false);
  const [qrOpen, setQrOpen] = useState(false);

  const reload = useCallback(async () => {
    if (!jobId) {
      setJob(null);
      setLoadState('missing');
      return;
    }
    try {
      const hit = await fetchRiderJobById(jobId);
      if (hit) {
        setJob(hit);
        setLoadState('ready');
        return;
      }
      if (riderId) {
        const res = await fetch(`/api/rider/jobs?rider_id=${encodeURIComponent(riderId)}`, {
          cache: 'no-store',
        });
        const d = await res.json().catch(() => ({}));
        const fromList = (d.jobs || []).find((j: { id: string }) => j.id === jobId);
        if (fromList) {
          setJob(fromList);
          setLoadState('ready');
          return;
        }
      }
      setJob(null);
      if (!profileLoading) setLoadState('missing');
    } catch {
      setJob(null);
      if (!profileLoading) setLoadState('missing');
    }
  }, [jobId, riderId, profileLoading]);

  useEffect(() => {
    if (!job?.order_id) return;
    ensureFoodRiderTracking(job.order_id, jobId)
      .then((t) => setTracking(t))
      .catch(() => {
        fetch(`/api/food/tracking/${encodeURIComponent(job.order_id)}`, { cache: 'no-store' })
          .then((r) => (r.ok ? r.json() : null))
          .then((t) => setTracking(t))
          .catch(() => setTracking(null));
      });
  }, [job?.order_id, job?.phase, jobId]);

  useEffect(() => {
    reload();
    const t = setInterval(reload, 12000);
    return () => clearInterval(t);
  }, [reload]);

  useEffect(() => {
    if (!job || job.status === 'completed') return;
    if (!navigator.geolocation) return;
    const geoOptsFast: PositionOptions = { enableHighAccuracy: false, maximumAge: 60000, timeout: 8000 };
    const geoOptsPrecise: PositionOptions = { enableHighAccuracy: true, maximumAge: 8000, timeout: 15000 };
    const onPos = (pos: GeolocationPosition) => {
      void sendRiderGps(jobId, pos.coords.latitude, pos.coords.longitude, riderId);
      setRiderPos({ lat: pos.coords.latitude, lng: pos.coords.longitude });
      void sendRiderTelemetry(riderId, {
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
        speed_kmh: pos.coords.speed != null ? pos.coords.speed * 3.6 : undefined,
        current_job_id: jobId,
        online: true,
      });
    };
    navigator.geolocation.getCurrentPosition(onPos, () => undefined, geoOptsFast);
    const tick = () => {
      navigator.geolocation.getCurrentPosition(onPos, () => undefined, geoOptsPrecise);
    };
    tick();
    const t = setInterval(tick, 8000);
    return () => clearInterval(t);
  }, [job, jobId, riderId]);

  const advance = async (
    phase?: string,
    photo_url?: string,
    gps?: { lat: number; lng: number },
  ) => {
    setBusy(true);
    setErr('');
    try {
      const res = await advanceRiderJob(jobId, {
        phase,
        rider_id: riderId,
        photo_url,
        lat: gps?.lat,
        lng: gps?.lng,
      });
      setJob(res.job);
      if (res.tracking) setTracking(res.tracking);
      const done =
        res.job?.status === 'completed' ||
        res.job?.phase === 'rider_completed' ||
        res.job?.phase === 'trip_completed' ||
        res.job?.phase === 'review_pending';
      if (done) {
        setJustCompleted(true);
        setTimeout(() => {
          window.location.href = '/m/rider/mine';
        }, 2500);
      }
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'อัปเดตไม่สำเร็จ');
    } finally {
      setBusy(false);
    }
  };

  const onProofCaptured = (url: string) => {
    setProofCameraOpen(false);
    setPhotoPreview(url);
    void advance('photo_proof', url, riderPos || undefined);
  };

  const onPickupPhotoCaptured = async (url: string) => {
    if (!job?.order_id) return;
    setPickupCameraOpen(false);
    setBusy(true);
    setErr('');
    try {
      await uploadRiderPickupPhoto(job.order_id, {
        image_data_url: url,
        rider_id: riderId,
        job_id: jobId,
        gps_lat: riderPos?.lat,
        gps_lng: riderPos?.lng,
        accuracy: undefined,
      });
      await reload();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'อัปโหลดรูปรับอาหารไม่สำเร็จ');
    } finally {
      setBusy(false);
    }
  };

  const onQrScanned = async (raw: string) => {
    if (!job?.order_id) return;
    setBusy(true);
    setErr('');
    try {
      await verifyRiderPickup(job.order_id, {
        qr_payload: raw,
        rider_id: riderId,
        job_id: jobId,
        merchant_id: job.merchant_id,
        gps_lat: riderPos?.lat,
        gps_lng: riderPos?.lng,
      });
      setQrOpen(false);
      await reload();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'สแกน QR ไม่สำเร็จ');
    } finally {
      setBusy(false);
    }
  };

  const [voiceMsg, setVoiceMsg] = useState('');
  const [listening, setListening] = useState(false);

  const runVoice = () => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) {
      setErr('เบราว์เซอร์ไม่รองรับเสียง — พิมพ์คำสั่งแทน');
      return;
    }
    const rec = new SR();
    rec.lang = 'th-TH';
    rec.interimResults = false;
    setListening(true);
    setVoiceMsg('');
    rec.onresult = (ev: any) => {
      const text = ev.results?.[0]?.[0]?.transcript || '';
      setVoiceMsg(text);
      void fetch('/api/ai/rider-voice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          transcript: text,
          rider_id: riderId,
          job_id: jobId,
          order_id: job?.order_id,
          phase: job?.phase,
        }),
      })
        .then((r) => r.json())
        .then((d) => {
          setVoiceMsg(d.reply_th || text);
          if (d.job) setJob(d.job);
          if (d.action === 'advance') reload();
          if (d.action === 'incident' && d.incident?.id) {
            setVoiceMsg(`${d.reply_th} (#${d.incident.id.slice(-6)})`);
          }
        })
        .catch((e: Error) => setErr(e.message))
        .finally(() => setListening(false));
    };
    rec.onerror = () => setListening(false);
    rec.onend = () => setListening(false);
    rec.start();
  };

  const reportIssue = async (issueId: string) => {
    setIssueOpen(false);
    setBusy(true);
    setErr('');
    try {
      const labels: Record<string, string> = {
        customer_no_answer: 'ลูกค้าไม่รับสาย',
        merchant_closed: 'ร้านปิดของหมด',
        wrong_pin: 'พิกัดผิด',
        vehicle_breakdown: 'รถเสีย',
      };
      const res = await fetch('/api/ai/rider-voice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          transcript: labels[issueId] || issueId,
          rider_id: riderId,
          job_id: jobId,
          order_id: job?.order_id,
          phase: job?.phase,
          lat: riderPos?.lat,
          lng: riderPos?.lng,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'แจ้งปัญหาไม่สำเร็จ');
      setErr('');
      alert(data.reply_th || 'บันทึกปัญหาแล้ว — ทีมซัพพอร์ตจะติดตาม');
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'แจ้งปัญหาไม่สำเร็จ');
    } finally {
      setBusy(false);
    }
  };

  if (loadState === 'missing') {
    return (
      <div className="tt-rider-active-page">
        <p className="tt-error-inline">ไม่พบงานนี้ — อาจถูกยกเลิกหรือหมดอายุแล้ว</p>
        <Link href="/m/rider/map" className="tt-link-accent">← กลับไปแผนที่</Link>
      </div>
    );
  }

  if (!job) {
    return (
      <div className="tt-rider-active-page">
        <p className="tt-loading">กำลังโหลดงาน…</p>
        <Link href="/m/rider/map" className="tt-link-accent">← กลับ</Link>
      </div>
    );
  }

  const isPassenger = job.job_type === 'passenger';
  const flowStage = riderFlowStage(job.phase, job.job_type);
  const next = nextRiderAction(job.phase, job.job_type, {
    paymentMethod: job.payment_method,
  });
  const messages = tracking?.chat_messages || [];
  const orderRef = formatDispatchOrderReferenceCode({
    order_id: job.order_id,
    job_type: job.job_type,
    created_at: job.updated_at,
  });
  const customerLabel = job.recipient_name || (isPassenger ? 'ผู้โดยสาร' : 'ลูกค้า');
  const hasMerchantChat =
    !!job.merchant_id && !String(job.merchant_id).startsWith('passenger:');

  const openCustomerChat = () => {
    if (!job.order_id) return;
    void ensureFoodRiderTracking(job.order_id, jobId)
      .then((t) => {
        setTracking(t);
        setCustomerChatOpen(true);
      })
      .catch(() => setCustomerChatOpen(true));
  };

  const openHelpCenter = () => {
    setHelpCenterTab('help');
    setHelpCenterOpen(true);
  };

  const expandCustomerChat = () => {
    setCustomerChatOpen(false);
    setHelpCenterTab('chat');
    setHelpCenterOpen(true);
  };

  const expandMerchantChat = () => {
    if (!job?.merchant_id || !riderId) return;
    setMerchantChatOpen(false);
    const href = riderShopChatHref(job.merchant_id, riderId, {
      orderId: job.order_id,
      reference: orderRef,
      embed,
    });
    router.push(href);
  };
  const needsFoodProof = requiresDeliveryPhoto(job.job_type);
  const proofUrl = photoPreview || job.delivery_proof_url;
  const isCod =
    !isPassenger &&
    (String(job.payment_method || 'cod').toLowerCase() === 'cod' || !job.payment_method);
  const showCodCollect =
    isCod && (job.phase === 'cod_payment' || job.phase === 'handoff' || next?.phase === 'cod_payment');

  const navFullscreen = isRiderNavFullscreen(job.phase, job.status);
  const hasMap = job.pickup_lat != null && job.dropoff_lat != null;

  const mapBlock = hasMap ? (
    <RiderActiveNavMap
      pickup={{
        lat: job.pickup_lat!,
        lng: job.pickup_lng!,
        label: isPassenger ? 'จุดรับผู้โดยสาร' : job.merchant_name,
      }}
      dropoff={{ lat: job.dropoff_lat!, lng: job.dropoff_lng!, label: job.address }}
      rider={riderPos || undefined}
      phase={job.phase}
      jobType={job.job_type}
      fullscreen={navFullscreen}
    />
  ) : null;

  const pickupQrFlow = isFoodPickupQrRequired() && job.job_type !== 'passenger' && job.job_type !== 'parcel';

  const primaryAction =
    next && job.status !== 'completed' && !justCompleted ? (
      pickupQrFlow && job.phase === 'arrived_merchant' ? (
        <button
          type="button"
          className="tt-btn-primary tt-rider-active-cta"
          disabled={busy}
          onClick={() => setQrOpen(true)}
        >
          📱 สแกน QR รับออเดอร์
        </button>
      ) : pickupQrFlow && job.phase === 'qr_verified' ? (
        <button
          type="button"
          className="tt-btn-primary tt-rider-active-cta"
          disabled={busy}
          onClick={() => setPickupCameraOpen(true)}
        >
          📷 ถ่ายรูปรับจากร้าน
        </button>
      ) : next.needsPhoto && job.phase !== 'photo_proof' ? (
        <button
          type="button"
          className="tt-btn-primary tt-rider-active-cta"
          disabled={busy}
          onClick={() => setProofCameraOpen(true)}
        >
          📷 ถ่ายรูปหลักฐาน
        </button>
      ) : (
        <button
          type="button"
          className="tt-btn-primary tt-rider-active-cta"
          disabled={busy}
          onClick={() => void advance(next.phase)}
        >
          {next.label}
        </button>
      )
    ) : null;

  const toolsSection = (
    <div className="tt-rider-active-tools">
      <div className="tt-rider-active-tools-divider">
        <span>ติดต่อ & ความปลอดภัย</span>
      </div>

      <div className="tt-rider-active-contact-row">
        <button type="button" className="tt-rider-contact-chip primary" onClick={openCustomerChat}>
          <span className="tt-rider-contact-chip-icon" aria-hidden>
            <RiderContactCustomerIcon size={24} />
          </span>
          <span>แชทลูกค้า{messages.length ? ` (${messages.length})` : ''}</span>
        </button>
        {hasMerchantChat ? (
          <button type="button" className="tt-rider-contact-chip" onClick={() => setMerchantChatOpen(true)}>
            <span className="tt-rider-contact-chip-icon merchant" aria-hidden>
              <RiderContactMerchantIcon size={24} />
            </span>
            <span>แชทร้าน</span>
          </button>
        ) : (
          <button type="button" className="tt-rider-contact-chip muted" disabled>
            <span className="tt-rider-contact-chip-icon merchant" aria-hidden>
              <RiderContactMerchantIcon size={24} />
            </span>
            <span>แชทร้าน</span>
          </button>
        )}
        <button type="button" className="tt-rider-contact-chip help" onClick={openHelpCenter}>
          <span className="tt-rider-contact-chip-icon help" aria-hidden>
            <RiderContactHelpIcon size={24} />
          </span>
          <span>ศูนย์ช่วยเหลือ</span>
        </button>
      </div>

      <div className="tt-rider-active-safety">
        <RiderSosButton
          riderId={riderId}
          jobId={jobId}
          orderId={job.order_id}
          phase={job.phase}
          lat={riderPos?.lat}
          lng={riderPos?.lng}
        />
        <p className="tt-rider-active-safety-hint">
          แชร์ทริปให้ครอบครัวผ่านแชทลูกค้า (เร็วๆ นี้)
        </p>
      </div>

      <details className="tt-rider-voice-details">
        <summary className="tt-rider-voice-summary">🎤 คำสั่งเสียง</summary>
        <div className="tt-rider-voice-bar">
          <button
            type="button"
            className={`tt-rider-voice-mic${listening ? ' on' : ''}`}
            disabled={busy}
            onClick={() => runVoice()}
          >
            {listening ? 'กำลังฟัง…' : 'กดพูดคำสั่ง'}
          </button>
          {voiceMsg && <p className="tt-hint">{voiceMsg}</p>}
          <p className="tt-hint tt-rider-voice-hints">
            &quot;รับของแล้ว&quot; · &quot;ถึงแล้ว&quot; · &quot;ส่งสำเร็จ&quot;
          </p>
        </div>
      </details>
    </div>
  );

  const panelBody = (
    <>
      <header className="tt-rider-active-hero">
        <Link href="/m/rider/mine" className="tt-rider-active-hero-back">
          ‹ งานของฉัน
        </Link>
        <div className="tt-rider-active-hero-main">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={RIDER_OS_MARKER_SRC} alt="" className="tt-rider-active-hero-icon" width={44} height={44} />
          <div className="tt-rider-active-hero-copy">
            <p className="tt-rider-active-hero-kicker">รหัสอ้างอิง {orderRef}</p>
            <h1 className="tt-rider-active-hero-title">{customerLabel}</h1>
            <p className="tt-rider-active-hero-route">
              {isPassenger ? 'จุดรับผู้โดยสาร' : job.merchant_name} → {job.address || 'จุดส่ง'}
            </p>
          </div>
        </div>
        {job.recipient_name && (
          <p className="tt-rider-active-hero-customer">
            👤 {job.recipient_name}
            {job.customer_phone ? ` · ${job.customer_phone}` : ''}
          </p>
        )}
      </header>

      {!navFullscreen && mapBlock}

      {flowStage && job.status !== 'completed' && !justCompleted && (
        <div className={`tt-rider-flow-stage tt-rider-flow-stage--${flowStage.leg}`}>
          <span className="tt-rider-flow-step">ขั้น {flowStage.step}/2</span>
          <strong>{flowStage.title}</strong>
          <span className="tt-rider-flow-sub">{flowStage.subtitle}</span>
        </div>
      )}

      {justCompleted && (
        <div className="tt-rider-flow-success" role="status">
          ✅ {isPassenger ? 'สิ้นสุดงานสำเร็จ — จบการเดินทางแล้ว' : 'สิ้นสุดงานสำเร็จ — ส่งงานเรียบร้อย'}
        </div>
      )}

      {!isPassenger && needsFoodProof && job.status !== 'completed' && !job.delivery_proof_url && (
        <p className="tt-rider-proof-required tt-rider-proof-required--compact">
          📷 งานอาหาร · ถ่ายรูปส่ง+GPS ก่อนปิดงาน
        </p>
      )}

      <div className="tt-rider-active-status-pill">
        <span className="tt-rider-active-status-dot" aria-hidden />
        {riderPhaseLabel(job.phase, job.job_type)}
      </div>

      {job.delivery_proof_at && (
        <p className="tt-hint tt-rider-proof-meta">
          หลักฐานบันทึกเมื่อ {formatProofTimestamp(job.delivery_proof_at)}
          {job.delivery_proof_lat != null && job.delivery_proof_lng != null
            ? ` · GPS ${job.delivery_proof_lat.toFixed(5)}, ${job.delivery_proof_lng.toFixed(5)}`
            : ''}
        </p>
      )}

      {proofUrl && (
        <div className="tt-delivery-photo">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={proofUrl} alt="หลักฐานการส่ง" />
        </div>
      )}

      {err && <p className="tt-error-inline">{err}</p>}

      {showCodCollect && (
        <RiderCodCollectPanel
          jobId={jobId}
          orderId={job.order_id}
          amountMicro={job.amount_micro}
          onCollected={() => reload()}
        />
      )}

      {job.status === 'completed' && (
        <p className="tt-merchant-ok">
          {isPassenger ? '✅ จบการเดินทางสำเร็จ — รอผู้โดยสารให้คะแนน' : '✅ ส่งงานสำเร็จ — รอลูกค้าให้คะแนน'}
        </p>
      )}
    </>
  );

  const panelContent = (
    <RiderActiveBottomSheet
      floating={navFullscreen}
      collapsible={hasMap}
      statusLabel={riderPhaseLabel(job.phase, job.job_type)}
      primaryAction={
        <div className="tt-rider-active-footer">
          {primaryAction && <div className="tt-rider-active-cta-wrap">{primaryAction}</div>}
          {toolsSection}
        </div>
      }
    >
      {panelBody}
    </RiderActiveBottomSheet>
  );

  return (
    <div className={`tt-rider-active-page${navFullscreen ? ' tt-rider-active-page--nav-fs' : ''}`}>
      {navFullscreen && hasMap && (
        <div className="tt-rider-nav-fs-canvas" aria-hidden={false}>
          {mapBlock}
        </div>
      )}

      {panelContent}

      <RiderIssueSheet
        open={issueOpen}
        phase={job.phase}
        onClose={() => setIssueOpen(false)}
        onSelect={(id) => void reportIssue(id)}
      />

      <RiderProofCameraSheet
        open={pickupCameraOpen}
        onClose={() => setPickupCameraOpen(false)}
        onCapture={(url) => void onPickupPhotoCaptured(url)}
        busy={busy}
        title="ถ่ายรูปรับจากร้าน"
        hint="ถ่ายรูปอาหารที่รับจากร้าน — ต้องทำหลังสแกน QR ก่อนออกเดินทาง"
      />

      <RiderQrScanner
        open={qrOpen}
        onClose={() => !busy && setQrOpen(false)}
        onScan={(raw) => void onQrScanned(raw)}
        busy={busy}
      />

      <RiderProofCameraSheet
        open={proofCameraOpen}
        onClose={() => setProofCameraOpen(false)}
        onCapture={onProofCaptured}
        busy={busy}
        hint="ถ่ายรูปสินค้าที่ส่งมอบให้ลูกค้า — ระบบบันทึก GPS พร้อมรูป"
      />

      <TtRiderChatSheet
        orderId={job.order_id}
        open={customerChatOpen}
        messages={messages}
        riderName={tracking?.rider?.name || 'ไรเดอร์'}
        perspective="rider"
        counterpartLabel={customerLabel}
        counterpartPhone={job.customer_phone}
        orderRef={orderRef}
        onClose={() => setCustomerChatOpen(false)}
        onExpand={expandCustomerChat}
        photoCaption={
          flowStage?.leg === 'pickup' ? 'รูปหลักฐานรับของที่ร้าน' : 'รูปหลักฐานส่งของ'
        }
        onUpdate={setTracking}
      />

      {hasMerchantChat && (
        <RiderShopChatSheet
          shopId={job.merchant_id!}
          riderId={riderId}
          merchantName={job.merchant_name || job.merchant_id}
          orderRef={orderRef}
          orderId={job.order_id}
          open={merchantChatOpen}
          photoCaption={
            flowStage?.leg === 'pickup' ? 'รูปหลักฐานรับของที่ร้าน' : 'รูปหลักฐานส่งของ'
          }
          onClose={() => setMerchantChatOpen(false)}
          onExpand={expandMerchantChat}
        />
      )}

      <RiderHelpCenterOverlay
        open={helpCenterOpen}
        onClose={() => setHelpCenterOpen(false)}
        initialTab={helpCenterTab}
        userId={auth?.userId || riderId}
        orderId={job.order_id}
        orderRef={orderRef}
        jobId={jobId}
        customerLabel={customerLabel}
        customerPhone={job.customer_phone}
        merchantName={job.merchant_name}
        pickupLabel={job.merchant_name}
        dropoffLabel={job.address}
        amountMicro={job.amount_micro}
        jobType={job.job_type}
        messages={messages}
        onUpdate={setTracking}
      />
    </div>
  );
}
