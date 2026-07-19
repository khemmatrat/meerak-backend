'use client';

import Link from 'next/link';
import { StatusChip } from '@aqond/ui';
import { TimelineEmpty } from '@/components/talent/timeline/TimelineEmpty';
import { TimelineFilter } from '@/components/talent/timeline/TimelineFilter';
import { TimelineItem } from '@/components/talent/timeline/TimelineItem';
import { TimelineSkeleton } from '@/components/talent/timeline/TimelineSkeleton';
import { useTalentTimeline } from '@/hooks/talent/useTalentTimeline';
import {
  TALENT_TIMELINE_DAY_LABELS,
  type TalentTimelineDayGroupId,
} from '@/lib/talent/talentTimelineTypes';

const GROUP_ORDER: TalentTimelineDayGroupId[] = ['today', 'yesterday', 'earlier'];

export function ActivityTimeline() {
  const { loading, error, period, setPeriod, grouped, events, totalAll, loggedIn, reload } =
    useTalentTimeline();

  const hasEvents = events.length > 0;

  return (
    <div className="tt-talent-page tt-talent-timeline-page" data-talent-timeline>
      <header className="tt-talent-page-head">
        <Link href="/m/talent" className="tt-talent-notif-back" aria-label="กลับ Today">
          ←
        </Link>
        <span className="tt-talent-page-icon" aria-hidden>
          🕘
        </span>
        <div>
          <p className="tt-talent-page-module">Activity · TOS-7</p>
          <h2 className="tt-talent-page-title">Timeline</h2>
          <StatusChip tone="pending">Compose only · newest first</StatusChip>
        </div>
        <button
          type="button"
          className="tt-talent-today-refresh"
          onClick={() => void reload()}
          aria-label="รีเฟรช"
          disabled={loading}
        >
          ↻
        </button>
      </header>

      <TimelineFilter active={period} onChange={setPeriod} />

      {loggedIn && !loading ? (
        <p className="tt-talent-timeline-summary">
          แสดง {events.length} / {totalAll} กิจกรรม · เรียงใหม่ → เก่า
        </p>
      ) : null}

      {loading ? (
        <TimelineSkeleton />
      ) : !loggedIn ? (
        <>
          <TimelineEmpty period={period} loggedIn={false} />
          <Link href="/m/login?next=/m/talent/timeline" className="tt-talent-today-login">
            <span>🔑</span>
            <div>
              <strong>เข้าสู่ระบบ</strong>
              <p className="tt-hint">ดูกิจกรรมจาก API เดิม</p>
            </div>
          </Link>
        </>
      ) : error || !hasEvents ? (
        <TimelineEmpty period={period} loggedIn={loggedIn} error={error} />
      ) : (
        <div className="tt-talent-timeline-groups">
          {GROUP_ORDER.map((groupId) => {
            const rows = grouped[groupId];
            if (!rows.length) return null;
            return (
              <section
                key={groupId}
                className="tt-talent-timeline-group"
                aria-label={TALENT_TIMELINE_DAY_LABELS[groupId]}
              >
                <h3 className="tt-talent-timeline-group-title">{TALENT_TIMELINE_DAY_LABELS[groupId]}</h3>
                <ul className="tt-talent-timeline-list">
                  {rows.map((ev) => (
                    <TimelineItem key={ev.id} event={ev} />
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      )}

      <p className="tt-talent-shell-badge">
        Talent OS Activity Timeline · compose existing fetches · TOS-7
      </p>
    </div>
  );
}
