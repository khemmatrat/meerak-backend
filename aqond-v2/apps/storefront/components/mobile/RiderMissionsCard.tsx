'use client';

import { computeRiderMissions, computeSurgeHints, type RiderMission } from '@/lib/riderMissions';

type Props = {
  weekTrips: number;
  streakDays: number;
  acceptanceRate: number;
  completedTrips: number;
};

function MissionRow({ m }: { m: RiderMission }) {
  const pct = m.target > 0 ? Math.min(100, Math.round((m.progress / m.target) * 100)) : 0;
  return (
    <li className={`tt-rider-mission-row${m.done ? ' done' : ''}`}>
      <div className="tt-rider-mission-head">
        <span>
          {m.badge ? `${m.badge} ` : ''}
          {m.title}
        </span>
        <span className="tt-rider-mission-reward">{m.rewardLabel}</span>
      </div>
      <p className="tt-hint">{m.description}</p>
      <div className="tt-rider-mission-bar" aria-hidden>
        <span style={{ width: `${pct}%` }} />
      </div>
      <p className="tt-rider-mission-progress">
        {m.progress}/{m.target}
        {m.done ? ' ✓' : ''}
      </p>
    </li>
  );
}

export function RiderMissionsCard(props: Props) {
  const missions = computeRiderMissions({
    ...props,
    weekEarningsMicro: 0,
  });
  const surge = computeSurgeHints();

  return (
    <section className="tt-rider-missions-card" aria-label="ภารกิจและโซนรายได้">
      <h3>ภารกิจวันนี้</h3>
      <ul className="tt-rider-mission-list">
        {missions.map((m) => (
          <MissionRow key={m.id} m={m} />
        ))}
      </ul>
      <div className="tt-rider-surge-hints">
        <p className="tt-rider-surge-title">โซนรายได้ (ประมาณการ)</p>
        {surge.map((z) => (
          <span
            key={z.label}
            className={`tt-rider-surge-chip${z.active ? ' active' : ''}`}
          >
            {z.label} {z.active ? `${z.multiplier}x` : '1.0x'}
          </span>
        ))}
      </div>
    </section>
  );
}
