import Link from 'next/link';
import type { TalentCommerceMetric } from '@/lib/talent/commerce/talentCommerceTypes';

type Props = {
  metrics: TalentCommerceMetric[];
};

function trendClass(direction: 'up' | 'down' | 'flat'): string {
  if (direction === 'up') return 'is-up';
  if (direction === 'down') return 'is-down';
  return 'is-flat';
}

export function CommerceMetricGrid({ metrics }: Props) {
  return (
    <div className="tt-talent-commerce-metrics" aria-label="สรุป KPI">
      {metrics.map((m) => (
        <Link key={m.id} href={m.href} className="tt-talent-commerce-metric-card">
          <span className="tt-talent-commerce-metric-icon" aria-hidden>
            {m.icon}
          </span>
          <div className="tt-talent-commerce-metric-body">
            <span className="tt-talent-commerce-metric-label">{m.label}</span>
            <strong>{m.value}</strong>
            {m.hint ? <small>{m.hint}</small> : null}
          </div>
          {m.trend ? (
            <span className={`tt-talent-commerce-trend ${trendClass(m.trend.direction)}`}>
              {m.trend.label}
            </span>
          ) : null}
        </Link>
      ))}
    </div>
  );
}
