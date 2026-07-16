'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import {
  advanceRiderJob,
  nextRiderAction,
  sendRiderGps,
  sendRiderJobChat,
  sendRiderTelemetry,
  RIDER_PHASE_LABELS,
} from '@/lib/rider';
import { requiresDeliveryPhoto, formatProofTimestamp } from '@/lib/riderDeliveryProof';
import { useRider } from '@/components/mobile/RiderShell';
import { RiderActiveMap } from '@/components/mobile/RiderActiveMap';
import { RiderSosButton } from '@/components/mobile/RiderSosButton';
import { RiderCodCollectPanel } from '@/components/mobile/RiderCodCollectPanel';
import type { ChatMessage } from '@/lib/server/riderTracking';

type RiderJob = {
  id: string;
  order_id: string;
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
};

export default function RiderActiveJobPage() {
  const params = useParams();
  const jobId = String(params.jobId || '');
  const { riderId } = useRider();
  const [job, setJob] = useState<RiderJob | null>(null);
  const [tracking, setTracking] = useState<{ chat_messages?: ChatMessage[] } | null>(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [chatText, setChatText] = useState('');
  const [photoPreview, setPhotoPreview] = useState('');
  const [riderPos, setRiderPos] = useState<{ lat: number; lng: number } | null>(null);
  const [issueOpen, setIssueOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const reload = useCallback(() => {
    fetch(`/api/rider/jobs?rider_id=${encodeURIComponent(riderId)}`, { cache: 'no-store' })
      .then((r) => r.json())
      .then((d) => {
        const hit = (d.jobs || []).find((j: { id: string }) => j.id === jobId);
        setJob(hit || null);
      })
      .catch(() => setJob(null));
  }, [jobId, riderId]);

  useEffect(() => {
    if (!job?.order_id) return;
    fetch(`/api/food/tracking/${encodeURIComponent(job.order_id)}`, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((t) => setTracking(t))
      .catch(() => setTracking(null));
  }, [job?.order_id, job?.phase]);

  useEffect(() => {
    reload();
    const t = setInterval(reload, 12000);
    return () => clearInterval(t);
  }, [reload]);

  useEffect(() => {
    if (!job || job.status === 'completed') return;
    if (!navigator.geolocation) return;
    const tick = () => {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          void sendRiderGps(jobId, pos.coords.latitude, pos.coords.longitude);
          setRiderPos({ lat: pos.coords.latitude, lng: pos.coords.longitude });
          void sendRiderTelemetry(riderId, {
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
            speed_kmh: pos.coords.speed != null ? pos.coords.speed * 3.6 : undefined,
            current_job_id: jobId,
            online: true,
          });
        },
        () => {},
        { enableHighAccuracy: false, maximumAge: 15000 },
      );
    };
    tick();
    const t = setInterval(tick, 20000);
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
      if (res.job?.status === 'completed') {
        setTimeout(() => {
          window.location.href = '/m/rider/mine';
        }, 1500);
      }
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'อัปเดตไม่สำเร็จ');
    } finally {
      setBusy(false);
    }
  };

  const onPhotoPick = (file: File | null) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const url = String(reader.result || '');
      setPhotoPreview(url);
      void advance('photo_proof', url, riderPos || undefined);
    };
    reader.readAsDataURL(file);
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

  const sendChat = async () => {
    if (!job?.order_id || !chatText.trim()) return;
    setBusy(true);
    try {
      const data = await sendRiderJobChat(job.order_id, chatText.trim());
      setTracking((prev) => ({ ...prev, chat_messages: data.chat_messages }));
      setChatText('');
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'ส่งแชทไม่สำเร็จ');
    } finally {
      setBusy(false);
    }
  };

  const callCustomer = () => {
    const phone = job?.customer_phone?.replace(/[^\d+]/g, '');
    if (!phone) return;
    window.location.href = `tel:${phone}`;
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

  if (!job) {
    return (
      <div className="tt-rider-active-page">
        <p className="tt-loading">กำลังโหลดงาน…</p>
        <Link href="/m/rider/jobs" className="tt-link-accent">← กลับ</Link>
      </div>
    );
  }

  const next = nextRiderAction(job.phase);
  const messages = tracking?.chat_messages || [];
  const customerLabel = job.recipient_name || 'ลูกค้า';
  const needsFoodProof = requiresDeliveryPhoto(job.job_type);
  const proofUrl = photoPreview || job.delivery_proof_url;
  const isCod =
    String(job.payment_method || 'cod').toLowerCase() === 'cod' || !job.payment_method;
  const showCodCollect =
    isCod && (job.phase === 'cod_payment' || job.phase === 'handoff' || next?.phase === 'cod_payment');

  return (
    <div className="tt-rider-active-page">
      <Link href="/m/rider/mine" className="tt-back" style={{ display: 'inline-block', marginBottom: 8 }}>
        ‹ งานของฉัน
      </Link>
      <h1 className="tt-merchant-page-title">
        {job.job_type === 'parcel' ? '📦' : '🛵'} #{job.order_id?.slice(-8)}
      </h1>
      <p className="tt-hint">{job.merchant_name} → {job.address}</p>
      {job.recipient_name && (
        <p className="tt-hint">👤 {job.recipient_name}{job.customer_phone ? ` · ${job.customer_phone}` : ''}</p>
      )}
      {job.pickup_lat != null && job.dropoff_lat != null && (
        <RiderActiveMap
          pickup={{ lat: job.pickup_lat, lng: job.pickup_lng!, label: job.merchant_name }}
          dropoff={{ lat: job.dropoff_lat, lng: job.dropoff_lng!, label: job.address }}
          rider={riderPos || undefined}
          phase={job.phase}
        />
      )}

      <p className="tt-merchant-status-card" style={{ padding: 12, marginTop: 12 }}>
        สถานะ: <strong>{RIDER_PHASE_LABELS[job.phase] || job.phase}</strong>
      </p>

      {needsFoodProof && job.status !== 'completed' && !job.delivery_proof_url && (
        <p className="tt-rider-proof-required">
          📷 งานอาหาร — ต้องถ่ายรูปหลักฐานส่งของพร้อมตำแหน่ง GPS ก่อนปิดงาน
        </p>
      )}

      {job.delivery_proof_at && (
        <p className="tt-hint tt-rider-proof-meta">
          หลักฐานบันทึกเมื่อ {formatProofTimestamp(job.delivery_proof_at)}
          {job.delivery_proof_lat != null && job.delivery_proof_lng != null
            ? ` · GPS ${job.delivery_proof_lat.toFixed(5)}, ${job.delivery_proof_lng.toFixed(5)}`
            : ''}
        </p>
      )}

      <div className="tt-merchant-actions" style={{ marginTop: 12, flexWrap: 'wrap' }}>
        {job.customer_phone && (
          <button type="button" className="tt-btn-ghost tt-merchant-btn" onClick={callCustomer}>
            📞 โทรลูกค้า
          </button>
        )}
        <button type="button" className="tt-btn-ghost tt-merchant-btn" onClick={() => setChatOpen((v) => !v)}>
          💬 แชท{messages.length ? ` (${messages.length})` : ''}
        </button>
        <button type="button" className="tt-btn-ghost tt-merchant-btn" onClick={() => setIssueOpen(true)}>
          🆘 ขอความช่วยเหลือ
        </button>
      </div>

      <div className="tt-rider-active-safety" style={{ marginTop: 12, display: 'flex', gap: 8, alignItems: 'center' }}>
        <RiderSosButton
          riderId={riderId}
          jobId={jobId}
          orderId={job.order_id}
          phase={job.phase}
          lat={riderPos?.lat}
          lng={riderPos?.lng}
        />
        <p className="tt-hint" style={{ margin: 0, flex: 1 }}>
          แชร์ทริป: ส่งลิงก์ติดตามให้ครอบครัวผ่านแชทลูกค้า (เร็วๆ นี้)
        </p>
      </div>

      <RiderIssueSheet
        open={issueOpen}
        phase={job.phase}
        onClose={() => setIssueOpen(false)}
        onSelect={(id) => void reportIssue(id)}
      />

      {chatOpen && (
        <div className="tt-rider-chat-panel" style={{ marginTop: 12 }}>
          <p className="tt-hint">แชทกับ {customerLabel}</p>
          <div className="tt-chat-messages" style={{ maxHeight: 180, overflow: 'auto' }}>
            {messages.map((m, i) => (
              <div key={i} className={`tt-chat-bubble ${m.from}`}>
                <p>{m.text}</p>
              </div>
            ))}
          </div>
          <div className="tt-chat-input-row">
            <input
              className="tt-input tt-chat-input"
              placeholder="พิมพ์ถึงลูกค้า…"
              value={chatText}
              onChange={(e) => setChatText(e.target.value)}
            />
            <button type="button" className="tt-chat-send-btn" disabled={busy} onClick={() => void sendChat()}>
              ส่ง
            </button>
          </div>
        </div>
      )}

      {proofUrl && (
        <div className="tt-delivery-photo" style={{ marginTop: 12 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={proofUrl} alt="หลักฐานการส่ง" style={{ maxWidth: '100%', borderRadius: 8 }} />
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

      <div className="tt-rider-voice-bar">
        <button
          type="button"
          className={`tt-rider-voice-mic${listening ? ' on' : ''}`}
          disabled={busy}
          onClick={() => runVoice()}
        >
          {listening ? '🎙️ กำลังฟัง…' : '🎤 คำสั่งเสียง'}
        </button>
        {voiceMsg && <p className="tt-hint">{voiceMsg}</p>}
        <p className="tt-hint">พูด: &quot;รับของแล้ว&quot;, &quot;ถึงแล้ว&quot;, &quot;ส่งสำเร็จ&quot;, &quot;รายงานอุบัติเหตุ&quot;</p>
      </div>

      {next && job.status !== 'completed' && (
        <>
          {next.needsPhoto && job.phase !== 'photo_proof' ? (
            <>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                capture="environment"
                hidden
                onChange={(e) => onPhotoPick(e.target.files?.[0] || null)}
              />
              <button
                type="button"
                className="tt-btn-primary"
                style={{ width: '100%', marginTop: 16 }}
                disabled={busy}
                onClick={() => fileRef.current?.click()}
              >
                📷 ถ่ายรูปหลักฐาน
              </button>
            </>
          ) : (
            <button
              type="button"
              className="tt-btn-primary"
              style={{ width: '100%', marginTop: 16 }}
              disabled={busy}
              onClick={() => void advance(next.phase)}
            >
              {next.label}
            </button>
          )}
        </>
      )}

      {job.status === 'completed' && (
        <p className="tt-merchant-ok">✅ ส่งงานสำเร็จ — รอลูกค้าให้คะแนน</p>
      )}
      <p className="tt-hint" style={{ marginTop: 16 }}>
        GPS ส่งอัตโนมัติทุก 20 วินาที (เมื่ออนุญาตตำแหน่ง)
      </p>
    </div>
  );
}
