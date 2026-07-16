'use client';

import { getRiderKycBadge } from '@/lib/riderKycBadge';
import type { RiderProfile } from '@/lib/rider';

type Props = {
  profile?: RiderProfile | null;
  size?: 'sm' | 'md';
  className?: string;
};

export function RiderKycBadge({ profile, size = 'md', className }: Props) {
  const { tone, label } = getRiderKycBadge(profile);
  if (tone === 'none') return null;

  return (
    <span
      className={`tt-rider-kyc-badge tt-rider-kyc-badge--${tone}${size === 'sm' ? ' sm' : ''}${className ? ` ${className}` : ''}`}
      title="สถานะการยืนยันตัวตน (KYC)"
    >
      {tone === 'verified' && <span className="tt-rider-kyc-badge-icon" aria-hidden>✓</span>}
      {label}
    </span>
  );
}
