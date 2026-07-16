import type { RiderProfile } from '@/lib/rider';

export type RiderKycBadgeTone = 'verified' | 'pending' | 'rejected' | 'none';

export function riderKycBadgeTone(
  kyc?: string,
  active?: boolean,
): RiderKycBadgeTone {
  if (!active) return 'none';
  const s = String(kyc || '').toLowerCase();
  if (s === 'approved') return 'verified';
  if (s === 'rejected') return 'rejected';
  if (s === 'pending' || s === 'submitted') return 'pending';
  return 'none';
}

export function riderKycBadgeLabel(tone: RiderKycBadgeTone): string {
  switch (tone) {
    case 'verified':
      return 'ยืนยันแล้ว';
    case 'pending':
      return 'รอตรวจสอบ';
    case 'rejected':
      return 'ไม่ผ่านการยืนยัน';
    default:
      return 'ยังไม่ยืนยัน';
  }
}

export function getRiderKycBadge(profile?: RiderProfile | null) {
  const tone = riderKycBadgeTone(profile?.kyc_status, profile?.active);
  return { tone, label: riderKycBadgeLabel(tone) };
}
