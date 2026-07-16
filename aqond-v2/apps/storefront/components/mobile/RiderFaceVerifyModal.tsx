'use client';

import { useState } from 'react';
import { RiderFaceLivenessVerify } from '@/components/mobile/RiderFaceLivenessVerify';
import {
  verifyRiderFace,
  type RiderFaceVerifyPurpose,
} from '@/lib/riderFaceSession';

type Props = {
  open: boolean;
  riderId: string;
  purpose: RiderFaceVerifyPurpose;
  authToken?: string;
  lat?: number;
  lng?: number;
  verifyLevel?: string;
  strictIntervalDays?: number;
  onClose: () => void;
  onVerified: (sessionToken: string) => void;
};

const PURPOSE_LABEL: Record<string, string> = {
  daily: 'ตอกบัตรเข้างาน — สแกนหน้าเช้านี้',
  strict: 'ตรวจเข้มงวด (ครบรอบ)',
  passenger: 'ก่อนรับงานผู้โดยสาร',
  online: 'ตอกบัตรเข้างาน — สแกนหน้าเช้านี้',
  reverify: 'ตรวจเข้มงวด (ครบรอบ)',
};

const PURPOSE_HINT: Record<string, string> = {
  daily: 'กิจวัตรพื้นฐาน — วันละครั้งก่อนเปิดรับงาน เหมือนตอกบัตรเข้างาน',
  strict: 'ยืนยันตัวตนเข้มงวดตามรอบ — นับจากครั้งล่าสุด',
  passenger: 'งานรับส่งผู้โดยสารต้องยืนยันใบหน้าเพิ่ม',
};

export function RiderFaceVerifyModal({
  open,
  riderId,
  purpose,
  authToken,
  lat,
  lng,
  verifyLevel,
  strictIntervalDays = 3,
  onClose,
  onVerified,
}: Props) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  if (!open) return null;

  const normalized =
    purpose === 'online' ? 'daily' : purpose === 'reverify' ? 'strict' : purpose;

  const submit = async (payload: {
    selfieBase64: string;
    liveness: { steps: Array<{ id: 'center' | 'turn_left' | 'turn_right' | 'blink'; completed_at: string }> };
  }) => {
    setBusy(true);
    setErr('');
    try {
      const out = await verifyRiderFace({
        riderId,
        purpose,
        selfieBase64: payload.selfieBase64,
        liveness: payload.liveness,
        lat,
        lng,
        token: authToken,
      });
      onVerified(out.session_token);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'ยืนยันใบหน้าไม่สำเร็จ');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="tt-rider-face-modal-backdrop" role="dialog" aria-modal="true">
      <div className="tt-rider-face-modal">
        <div className="tt-rider-face-modal-header">
          <h3>{PURPOSE_LABEL[normalized] || 'ยืนยันใบหน้า'}</h3>
          <p className="tt-rider-face-modal-strong" style={{ color: '#475569' }}>
            {PURPOSE_HINT[normalized]}
            {normalized === 'strict' && ` (ทุก ${strictIntervalDays} วัน)`}
          </p>
          {verifyLevel === 'strong' && normalized === 'strict' && (
            <p className="tt-rider-face-modal-strong">
              ระดับ C: ผูกอุปกรณ์ + GPS — ไม่ตรงจะระงับทันที
            </p>
          )}
          <button type="button" className="tt-rider-face-modal-close" onClick={onClose} disabled={busy}>
            ✕
          </button>
        </div>
        {busy ? (
          <p className="tt-rider-face-modal-busy">กำลังตรวจสอบใบหน้ากับระบบ…</p>
        ) : (
          <RiderFaceLivenessVerify onComplete={(p) => void submit(p)} onError={setErr} />
        )}
        {err && <p className="tt-rider-face-modal-err">{err}</p>}
      </div>
    </div>
  );
}
