'use client';

import Link from 'next/link';
import { fcmWebConfigured } from '@/lib/fcmWeb';
import { useAuth } from '@/lib/auth';
import { registerRiderFcm } from '@/lib/fcmWeb';
import { useRider } from '@/components/mobile/RiderShell';
import { useState } from 'react';

export default function RiderSettingsPage() {
  const { auth } = useAuth();
  const { riderId } = useRider();
  const [pushOk, setPushOk] = useState(false);
  const [busy, setBusy] = useState(false);

  const enablePush = async () => {
    if (!auth) return;
    setBusy(true);
    try {
      const tok = await registerRiderFcm(auth);
      setPushOk(!!tok);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="tt-rider-settings-page">
      <h2 className="tt-rider-section-title">ตั้งค่า</h2>
      <ul className="tt-rider-menu-list">
        <li>
          <span>แจ้งเตือนงานใหม่ (Push)</span>
          {fcmWebConfigured() ? (
            <button type="button" className="tt-rider-accept-btn" disabled={busy} onClick={() => void enablePush()}>
              {pushOk ? '✓ เปิดแล้ว' : busy ? '…' : 'เปิด Push'}
            </button>
          ) : (
            <span className="tt-hint">ไม่พร้อม</span>
          )}
        </li>
        <li><span>GPS ระหว่างส่ง</span><strong>อัตโนมัติเมื่อออนไลน์</strong></li>
        <li><span>ภาษา</span><strong>ไทย</strong></li>
      </ul>
      <p className="tt-hint">Rider ID: {riderId || '—'}</p>
      <Link href="/m/rider/profile" className="tt-back">‹ กลับโปรไฟล์</Link>
    </div>
  );
}
