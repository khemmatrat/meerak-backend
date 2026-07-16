'use client';

import { formatCatalogPrice } from '@/lib/format';
import { buildWeeklyLeaderboard } from '@/lib/riderMissions';

type Props = {
  riderName?: string;
  weekTrips: number;
  weekEarningsMicro: number;
};

export function RiderLeaderboardCard({ riderName, weekTrips, weekEarningsMicro }: Props) {
  const rows = buildWeeklyLeaderboard(riderName || 'คุณ', weekTrips, weekEarningsMicro);

  return (
    <section className="tt-rider-leaderboard-card" aria-label="อันดับสัปดาห์นี้">
      <h3>🏆 อันดับสัปดาห์นี้</h3>
      <p className="tt-hint">อันดับจริงจะมาจาก API เมื่อเปิด production — ตอนนี้แสดงตัวคุณเทียบตัวอย่าง</p>
      <ol className="tt-rider-leaderboard-list">
        {rows.map((r) => (
          <li
            key={`${r.rank}-${r.label}`}
            className={`tt-rider-leaderboard-row${r.isSelf ? ' self' : ''}`}
          >
            <span className="tt-rider-lb-rank">#{r.rank}</span>
            <span className="tt-rider-lb-name">{r.label}</span>
            <span className="tt-rider-lb-stat">{r.trips} เที่ยว</span>
            <span className="tt-rider-lb-earn">{formatCatalogPrice(r.earningsMicro)}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}
