import Link from 'next/link';
import { TALENT_TIMELINE_SOURCE_META } from '@/lib/talent/talentTimelineTypes';
import type { TalentTimelineEvent } from '@/lib/talent/talentTimelineTypes';

function formatWhen(iso: string): string {
  try {
    return new Intl.DateTimeFormat('th-TH', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(iso));
  } catch {
    return iso;
  }
}

type Props = {
  event: TalentTimelineEvent;
};

export function TimelineItem({ event }: Props) {
  const sourceMeta = TALENT_TIMELINE_SOURCE_META[event.source];

  return (
    <li className="tt-talent-timeline-item">
      <span className="tt-talent-timeline-rail" aria-hidden />
      <span className="tt-talent-timeline-dot" aria-hidden />
      <Link href={event.href} className="tt-talent-timeline-card">
        <div className="tt-talent-timeline-card-top">
          <span className="tt-talent-timeline-icon" aria-hidden>
            {event.icon}
          </span>
          <div className="tt-talent-timeline-head">
            <strong>{event.title}</strong>
            <span className="tt-talent-timeline-source">{sourceMeta.label}</span>
          </div>
        </div>
        {event.subtitle ? <p className="tt-talent-timeline-sub">{event.subtitle}</p> : null}
        <div className="tt-talent-timeline-foot">
          <time dateTime={event.occurredAt}>{formatWhen(event.occurredAt)}</time>
          {event.meta ? <span>{event.meta}</span> : null}
        </div>
      </Link>
    </li>
  );
}
