'use client';

import Link from 'next/link';
import { StatusChip } from '@aqond/ui';
import { useRider } from '@/components/mobile/RiderShell';
import { riderKycLabel } from '@/lib/rider';

export default function RiderProfilePage() {
  const { profile, riderName, riderId, kycLabel, canOperate } = useRider();
  const avatar = riderName.slice(0, 2);

  return (
    <div className="tt-rider-profile-page">
      <div className="tt-rider-profile-card tt-rider-profile-card--large">
        <div className="tt-rider-profile-avatar large">{avatar}</div>
        <div>
          <p className="tt-rider-profile-name">{riderName}</p>
          <StatusChip tone={canOperate ? 'online' : 'pending'} live={canOperate}>
            {kycLabel}
          </StatusChip>
          {riderId && <p className="tt-hint">ID: {riderId.slice(0, 16)}…</p>}
        </div>
      </div>

      <ul className="tt-rider-menu-list">
        <li><span>เบอร์โทร</span><strong>{profile?.phone || '—'}</strong></li>
        <li><span>ยานพาหนะ</span><strong>{profile?.vehicle || 'มอเตอร์ไซค์'}</strong></li>
        <li><span>ทะเบียน</span><strong>{profile?.plate || '—'}</strong></li>
        <li><span>สถานะ</span><strong>{canOperate ? 'พร้อมรับงาน' : riderKycLabel(profile?.kyc_status, profile?.active)}</strong></li>
      </ul>

      <Link href="/m/rider/settings" className="tt-rider-menu-link">⚙️ ตั้งค่า</Link>
      <Link href="/m/rider/signup" className="tt-rider-menu-link">🛡️ ยืนยันตัวตน / อัปเดตเอกสาร</Link>
      <Link href="/m/rider/mine" className="tt-rider-menu-link">📦 งานของฉัน</Link>
    </div>
  );
}
