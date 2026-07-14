import type { TimelineStep } from '@/lib/server/riderTracking';

const STEP_ICON: Record<string, string> = {
  shop: '🏪',
  prep: '👨‍🍳',
  find: '🔍',
  pickup: '📦',
  deliver: '🛵',
  arrive: '🏠',
  done: '✓',
};

type Props = {
  steps: TimelineStep[];
};

export function TtDeliveryTimeline({ steps }: Props) {
  const activeIdx = steps.findIndex((s) => s.active);
  const progress =
    activeIdx >= 0
      ? ((activeIdx + (steps[activeIdx]?.done ? 1 : 0.5)) / Math.max(1, steps.length - 1)) * 100
      : 0;

  return (
    <div className="tt-delivery-timeline-v2">
      <div className="tt-delivery-tl-track" aria-hidden>
        <div className="tt-delivery-tl-fill" style={{ width: `${Math.min(100, progress)}%` }} />
      </div>
      <ol className="tt-delivery-timeline">
        {steps.map((step) => (
          <li
            key={step.id}
            className={`tt-delivery-tl-item${step.done ? ' done' : ''}${step.active ? ' active' : ''}`}
          >
            <span className="tt-delivery-tl-dot" aria-hidden>
              {step.done ? '✓' : STEP_ICON[step.id] || '·'}
            </span>
            <span className="tt-delivery-tl-label">{step.label}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}
