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
import { useRider } from '@/components/mobile/RiderShell';
import { RiderActiveMap } from '@/components/mobile/RiderActiveMap';
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

  const advance = async (phase?: string, photo_url?: string) => {
    setBusy(true);
    setErr('');
    try {
      const res = await advanceRiderJob(jobId, { phase, rider_id: riderId, photo_url });
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
      void advance('photo_proof', url);
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

      <div className="tt-merchant-actions" style={{ marginTop: 12, flexWrap: 'wrap' }}>
        {job.customer_phone && (
          <button type="button" className="tt-btn-ghost tt-merchant-btn" onClick={callCustomer}>
            📞 โทรลูกค้า
          </button>
        )}
        <button type="button" className="tt-btn-ghost tt-merchant-btn" onClick={() => setChatOpen((v) => !v)}>
          💬 แชท{messages.length ? ` (${messages.length})` : ''}
        </button>
      </div>

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

      {photoPreview && (
        <div className="tt-delivery-photo" style={{ marginTop: 12 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={photoPreview} alt="หลักฐานการส่ง" style={{ maxWidth: '100%', borderRadius: 8 }} />
        </div>
      )}

      {err && <p className="tt-error-inline">{err}</p>}

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
