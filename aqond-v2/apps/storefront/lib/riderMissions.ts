/**
 * Rider missions / quests — computed client-side from dashboard stats.
 * No new tables; progress derived from existing rider dashboard payloads.
 */

export type RiderMission = {
  id: string;
  title: string;
  description: string;
  progress: number;
  target: number;
  rewardLabel: string;
  badge?: string;
  done: boolean;
};

export type RiderMissionInput = {
  weekTrips: number;
  streakDays: number;
  acceptanceRate: number;
  completedTrips: number;
  weekEarningsMicro: number;
};

/** Lunch rush: 10 trips between 11:00–13:00 — approximated by week progress for v1 */
export function computeRiderMissions(input: RiderMissionInput): RiderMission[] {
  const missions: RiderMission[] = [];

  missions.push({
    id: 'week_trips_10',
    title: 'ครบ 10 เที่ยวสัปดาห์นี้',
    description: 'รับงานให้ครบ 10 เที่ยวก่อนสิ้นสัปดาห์',
    progress: Math.min(input.weekTrips, 10),
    target: 10,
    rewardLabel: 'โบนัส +฿50 (เมื่อเปิดระบบ)',
    done: input.weekTrips >= 10,
  });

  missions.push({
    id: 'streak_5',
    title: 'ทำงานติด 5 วัน',
    description: 'ส่งงานสำเร็จติดต่อกัน 5 วัน',
    progress: Math.min(input.streakDays, 5),
    target: 5,
    rewardLabel: 'เหรียญ Early Bird',
    badge: '🔥',
    done: input.streakDays >= 5,
  });

  missions.push({
    id: 'accept_rate_80',
    title: 'อัตรารับงาน 80%+',
    description: 'รับงานที่เสนออย่างน้อย 8 ใน 10 ครั้ง',
    progress: Math.min(Math.round(input.acceptanceRate), 100),
    target: 80,
    rewardLabel: 'คะแนน Tier +5%',
    done: input.acceptanceRate >= 80,
  });

  if (input.completedTrips < 5) {
    missions.push({
      id: 'first_5',
      title: 'งานแรก 5 เที่ยว',
      description: 'ส่งสำเร็จครบ 5 เที่ยวแรก',
      progress: Math.min(input.completedTrips, 5),
      target: 5,
      rewardLabel: 'ปลดล็อกงาน COD สูง',
      done: input.completedTrips >= 5,
    });
  }

  return missions;
}

export type SurgeZoneHint = {
  label: string;
  multiplier: number;
  active: boolean;
  reason: string;
};

/** Heuristic surge hints from time-of-day (no heatmap backend yet) */
export function computeSurgeHints(now = new Date()): SurgeZoneHint[] {
  const hour = Number(
    now.toLocaleString('en-US', { hour: 'numeric', hour12: false, timeZone: 'Asia/Bangkok' }),
  );
  const lunch = hour >= 11 && hour < 14;
  const dinner = hour >= 17 && hour < 21;
  return [
    {
      label: 'โซนกลางเมือง',
      multiplier: lunch || dinner ? 1.3 : 1.0,
      active: lunch || dinner,
      reason: lunch ? 'ช่วงมื้อกลางวัน' : dinner ? 'ช่วงมื้อเย็น' : 'ปกติ',
    },
    {
      label: 'โซนรอบมหาวิทยาลัย',
      multiplier: hour >= 16 && hour < 19 ? 1.2 : 1.0,
      active: hour >= 16 && hour < 19,
      reason: 'ช่วงเร่งด่วน',
    },
  ];
}

export type LeaderboardEntry = {
  rank: number;
  label: string;
  trips: number;
  earningsMicro: number;
  isSelf?: boolean;
};

/** Self + illustrative peers until dedicated leaderboard API exists */
export function buildWeeklyLeaderboard(
  selfName: string,
  weekTrips: number,
  weekEarningsMicro: number,
): LeaderboardEntry[] {
  const self: LeaderboardEntry = {
    rank: 0,
    label: selfName || 'คุณ',
    trips: weekTrips,
    earningsMicro: weekEarningsMicro,
    isSelf: true,
  };
  const peers: LeaderboardEntry[] = [
    { rank: 1, label: 'rider-***42', trips: Math.max(weekTrips + 3, 12), earningsMicro: weekEarningsMicro + 45000 },
    { rank: 2, label: 'rider-***88', trips: Math.max(weekTrips + 1, 9), earningsMicro: weekEarningsMicro + 22000 },
  ];
  self.rank = weekTrips >= peers[0].trips ? 1 : weekTrips >= peers[1].trips ? 2 : 3;
  const list = [...peers, self].sort((a, b) => b.trips - a.trips);
  return list.map((e, i) => ({ ...e, rank: i + 1 }));
}
