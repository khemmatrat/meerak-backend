'use client';

import type { TalentTimelinePeriodId } from '@/lib/talent/talentTimelineTypes';
import { TALENT_TIMELINE_PERIODS } from '@/lib/talent/talentTimelineTypes';

type Props = {
  active: TalentTimelinePeriodId;
  onChange: (period: TalentTimelinePeriodId) => void;
};

export function TimelineFilter({ active, onChange }: Props) {
  return (
    <div className="tt-talent-timeline-filters" role="tablist" aria-label="ช่วงเวลา">
      {TALENT_TIMELINE_PERIODS.map((p) => (
        <button
          key={p.id}
          type="button"
          role="tab"
          className={active === p.id ? 'active' : ''}
          aria-selected={active === p.id}
          onClick={() => onChange(p.id)}
        >
          {p.label}
        </button>
      ))}
    </div>
  );
}
