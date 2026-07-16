'use client';

import Link from 'next/link';
import { fcmWebConfigured } from '@/lib/fcmWeb';
import { useAuth } from '@/lib/auth';
import { registerRiderFcm } from '@/lib/fcmWeb';
import { riderOsPath } from '@/lib/riderOsPaths';
import { useRider } from '@/components/mobile/RiderShell';
import { RiderOsIcon } from '@/components/mobile/RiderOsIcons';
import { RiderKycBadge } from '@/components/mobile/RiderKycBadge';
import { useState } from 'react';

export default function RiderSettingsPage() {
  const { auth } = useAuth();
  const { riderId, profile } = useRider();
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
      {profile?.rider_id && (
        <div className="tt-rider-settings-kyc">
          <span>การยืนยันตัวตน</span>
          <RiderKycBadge profile={profile} />
        </div>
      )}
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

      {riderId && (
        <p className="tt-rider-settings-meta">
          <span>Rider ID</span>
          <code>{riderId}</code>
        </p>
      )}

      <Link href={riderOsPath('/profile')} className="tt-rider-back-card">
        <span className="tt-rider-back-card-icon" aria-hidden>
          <RiderOsIcon name="profile" size={22} />
        </span>
        <span className="tt-rider-back-card-text">
          <strong>กลับไปโปรไฟล์</strong>
          <small>ดูข้อมูลและสถานะบัญชี</small>
        </span>
        <svg className="tt-rider-back-card-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
          <path d="M9 18l6-6-6-6" />
        </svg>
      </Link>
    </div>
  );
}
