'use client';

import Link from 'next/link';
import { formatCatalogPrice } from '@/lib/format';
import {
  computeRiderTier,
  formatAcceptanceRate,
  type RiderTierId,
} from '@/lib/riderRetention';
import { riderOsPath } from '@/lib/riderOsPaths';

type Props = {
  weekTrips: number;
  weekEarningsMicro: number;
  streakDays: number;
  acceptanceRate: number;
  completedTrips: number;
  avgRating?: number | null;
};

const TIER_CLASS: Record<RiderTierId, string> = {
  bronze: 'bronze',
  silver: 'silver',
  gold: 'gold',
};

export function RiderRetentionCard({
  weekTrips,
  weekEarningsMicro,
  streakDays,
  acceptanceRate,
  completedTrips,
  avgRating,
}: Props) {
  const tier = computeRiderTier(completedTrips, avgRating);
  const accept = formatAcceptanceRate(acceptanceRate);

  return (
    <section className="tt-rider-retention-card" aria-label="สรุปสัปดาห์และระดับ">
      <div className="tt-rider-retention-head">
        <div>
          <h3>สัปดาห์นี้</h3>
          <p className="tt-rider-retention-week">
            <strong>{weekTrips}</strong> เที่ยว · <strong>{formatCatalogPrice(weekEarningsMicro)}</strong>
          </p>
        </div>
        <span className={`tt-rider-tier-badge tt-rider-tier-badge--${TIER_CLASS[tier.id]}`}>
          {tier.labelTh}
        </span>
      </div>

      <div className="tt-rider-retention-row">
        {streakDays > 0 && (
          <span className="tt-rider-streak-chip">🔥 {streakDays} วันติด</span>
        )}
        <span className={`tt-rider-accept-chip tt-rider-accept-chip--${accept.tone}`}>
          {accept.headline}
        </span>
      </div>

      {tier.tripsToNext != null && tier.tripsToNext > 0 && (
        <p className="tt-hint tt-rider-tier-hint">
          อีก {tier.tripsToNext} เที่ยว → ระดับ{' '}
          {tier.next === 'silver' ? 'ซิลเวอร์' : tier.next === 'gold' ? 'โกลด์' : tier.next}
        </p>
      )}

      <Link href={riderOsPath('/mine')} className="tt-rider-link tt-rider-retention-link">
        ดูประวัติงาน →
      </Link>
    </section>
  );
}
