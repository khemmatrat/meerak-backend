'use client';

import { useState } from 'react';
import { formatCatalogPrice } from '@/lib/format';
import { markRiderCodCollected } from '@/lib/riderCod';
import { useAuth } from '@/lib/auth';

type Props = {
  jobId: string;
  orderId?: string;
  amountMicro?: number;
  onCollected?: () => void;
};

/** In-active-job COD collection panel (wireframe: เก็บเงิน screen). */
export function RiderCodCollectPanel({ jobId, orderId, amountMicro, onCollected }: Props) {
  const { auth } = useAuth();
  const [method, setMethod] = useState<'cash' | 'qr'>('cash');
  const [amountThb, setAmountThb] = useState(
    amountMicro != null ? String((amountMicro / 100).toFixed(2)) : '',
  );
  const [photoUrl, setPhotoUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const onPhoto = (file: File | null) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setPhotoUrl(String(reader.result || ''));
    reader.readAsDataURL(file);
  };

  const submit = async () => {
    setBusy(true);
    setErr('');
    try {
      const micro = Math.round(parseFloat(amountThb || '0') * 100);
      await markRiderCodCollected(
        jobId,
        { amount_micro: micro, method, photo_url: photoUrl || undefined },
        auth,
      );
      onCollected?.();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'เก็บเงินไม่สำเร็จ');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="tt-rider-cod-collect" aria-label="เก็บเงินปลายทาง">
      <h3>💰 เก็บเงินปลายทาง (COD)</h3>
      {orderId && <p className="tt-hint">ออเดอร์ #{orderId.slice(-8)}</p>}
      <p className="tt-rider-cod-collect-amt">
        {amountMicro != null ? formatCatalogPrice(amountMicro) : '—'}
      </p>
      <div className="tt-rider-cod-methods">
        <button
          type="button"
          className={`tt-rider-cod-method${method === 'cash' ? ' active' : ''}`}
          onClick={() => setMethod('cash')}
        >
          💵 เงินสด
        </button>
        <button
          type="button"
          className={`tt-rider-cod-method${method === 'qr' ? ' active' : ''}`}
          onClick={() => setMethod('qr')}
        >
          📱 QR Code
        </button>
      </div>
      <label className="tt-rider-cod-field">
        ยอดที่ได้รับ (บาท)
        <input
          type="number"
          inputMode="decimal"
          value={amountThb}
          onChange={(e) => setAmountThb(e.target.value)}
          className="tt-rider-input"
        />
      </label>
      <label className="tt-rider-cod-field">
        ถ่ายรูปหลักฐาน (แนะนำ)
        <input type="file" accept="image/*" capture="environment" onChange={(e) => onPhoto(e.target.files?.[0] || null)} />
      </label>
      {photoUrl && <img src={photoUrl} alt="" className="tt-rider-cod-proof-preview" />}
      <button type="button" className="tt-rider-cod-deposit-all" disabled={busy} onClick={() => void submit()}>
        ✅ ยืนยันการเก็บเงิน
      </button>
      {err && <p className="tt-rider-err">{err}</p>}
    </section>
  );
}
