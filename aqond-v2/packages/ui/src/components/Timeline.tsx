import React from 'react';

export type TimelineItem = {
  id: string;
  label: string;
  time?: string;
  done?: boolean;
  active?: boolean;
};

type Props = {
  items: TimelineItem[];
  className?: string;
};

export function Timeline({ items, className = '' }: Props) {
  return (
    <ol className={`aq-timeline ${className}`.trim()} aria-label="Timeline">
      {items.map((item, idx) => {
        const state = item.active ? 'active' : item.done ? 'done' : 'pending';
        const isLast = idx === items.length - 1;
        return (
          <li
            key={item.id}
            className={`aq-timeline-item aq-timeline-item--${state}${isLast ? ' aq-timeline-item--last' : ''}`}
          >
            <span className="aq-timeline-rail" aria-hidden>
              <span className="aq-timeline-dot" />
              {!isLast && <span className="aq-timeline-line" />}
            </span>
            <div className="aq-timeline-content">
              {item.time && <time className="aq-timeline-time">{item.time}</time>}
              <span className="aq-timeline-label">{item.label}</span>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
