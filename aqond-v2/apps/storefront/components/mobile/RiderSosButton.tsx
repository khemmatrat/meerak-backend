'use client';

import { useState } from 'react';

type Props = {
  riderId: string;
  jobId?: string;
  orderId?: string;
  phase?: string;
  lat?: number;
  lng?: number;
  className?: string;
};

/**
 * SOS — reports emergency via existing rider-voice incident pipeline.
 * No new backend route; reuses /api/ai/rider-voice incident handler.
 */
export function RiderSosButton({
  riderId,
  jobId,
  orderId,
  phase,
  lat,
  lng,
  className,
}: Props) {
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [err, setErr] = useState('');

  const trigger = async () => {
    if (busy || sent) return;
    const ok = window.confirm(
      'แจ้งเหตุฉุกเฉิน SOS?\nทีมซัพพอร์ตจะได้รับพิกัดและข้อมูลงานของคุณทันที',
    );
    if (!ok) return;
    setBusy(true);
    setErr('');
    try {
      const res = await fetch('/api/ai/rider-voice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          transcript: 'SOS ฉุกเฉิน ขอความช่วยเหลือ',
          rider_id: riderId,
          job_id: jobId,
          order_id: orderId,
          phase,
          lat,
          lng,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'ส่ง SOS ไม่สำเร็จ');
      setSent(true);
      try {
        if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
      } catch {
        /* ignore */
      }
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'ส่ง SOS ไม่สำเร็จ');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={className}>
      <button
        type="button"
        className={`tt-rider-sos-btn${sent ? ' sent' : ''}`}
        disabled={busy || sent}
        onClick={() => void trigger()}
        aria-label="SOS ฉุกเฉิน"
      >
        {sent ? '✓ แจ้งแล้ว' : busy ? 'กำลังส่ง…' : 'SOS'}
      </button>
      {err && <p className="tt-error-inline">{err}</p>}
      {sent && (
        <p className="tt-hint">ทีมซัพพอร์ตได้รับแจ้งแล้ว — อยู่กับที่ถ้าปลอดภัย</p>
      )}
    </div>
  );
}
