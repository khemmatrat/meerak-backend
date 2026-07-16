'use client';

import Link from 'next/link';
import { useRider } from '@/components/mobile/RiderShell';
import { RiderKycBadge } from '@/components/mobile/RiderKycBadge';
import { computeRiderTier } from '@/lib/riderRetention';
import { fetchRiderCredits } from '@/lib/orders';
import { useAuth } from '@/lib/auth';
import { useEffect, useState } from 'react';

import { riderKycLabel } from '@/lib/rider';
import { riderOsPath } from '@/lib/riderOsPaths';
import { riderVehicleLabel } from '@/lib/riderVehicleTypes';

export default function RiderProfilePage() {
  const { auth } = useAuth();
  const { profile, riderName, riderId, kycLabel, canOperate } = useRider();
  const [completedTrips, setCompletedTrips] = useState(0);

  useEffect(() => {
    if (!profile?.rider_id) return;
    void fetchRiderCredits(profile.rider_id, auth?.userId, 1, auth)
      .then((c) => setCompletedTrips(c?.summary?.completed_jobs ?? 0))
      .catch(() => {});
  }, [profile?.rider_id, auth]);

  const tier = computeRiderTier(completedTrips);
  const avatar = riderName.slice(0, 2);
  const portraitUrl = profile?.profile_photo_url || null;

  return (
    <div className="tt-rider-profile-page">
      <div className="tt-rider-profile-card tt-rider-profile-card--large">
        <div className="tt-rider-profile-avatar large">
          {portraitUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={portraitUrl} alt="" className="tt-rider-profile-photo" />
          ) : (
            avatar
          )}
        </div>
        <div>
          <p className="tt-rider-profile-name">{riderName}</p>
          <div className="tt-rider-profile-badges">
            <RiderKycBadge profile={profile} />
            <span className={`tt-rider-tier-badge tt-rider-tier-badge--${tier.id} sm`}>
              {tier.labelTh}
            </span>
            {!canOperate && (
              <span className="tt-rider-kyc-badge tt-rider-kyc-badge--pending sm">{kycLabel}</span>
            )}
          </div>
          {riderId && <p className="tt-hint">ID: {riderId.slice(0, 16)}…</p>}
        </div>
      </div>

      <ul className="tt-rider-menu-list">
        <li><span>เบอร์โทร</span><strong>{profile?.phone || '—'}</strong></li>
        <li><span>ยานพาหนะ</span><strong>{riderVehicleLabel(profile?.vehicle)}</strong></li>
        <li><span>ทะเบียน</span><strong>{profile?.plate || '—'}</strong></li>
        <li>
          <span>สถานะ KYC</span>
          <strong>{riderKycLabel(profile?.kyc_status, profile?.active)}</strong>
        </li>
        <li><span>รับงาน</span><strong>{canOperate ? 'พร้อมรับงาน' : 'รออนุมัติ / ยังไม่พร้อม'}</strong></li>
      </ul>

      <Link href="/m/rider/settings" className="tt-rider-menu-link">⚙️ ตั้งค่า</Link>
      <Link href={riderOsPath('/kyc')} className="tt-rider-menu-link">🛡️ ยืนยันตัวตน / อัปเดตเอกสาร</Link>
      <Link href="/m/rider/mine" className="tt-rider-menu-link">📦 งานของฉัน</Link>
    </div>
  );
}
