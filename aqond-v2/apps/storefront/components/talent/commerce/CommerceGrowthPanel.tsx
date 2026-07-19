import type { TalentCommerceComposed } from '@/lib/talent/commerce/talentCommerceTypes';

type Props = {
  growth: TalentCommerceComposed['growth'];
  period: TalentCommerceComposed['period'];
};

export function CommerceGrowthPanel({ growth, period }: Props) {
  return (
    <section className="tt-talent-commerce-growth" aria-label="Growth">
      <h3>Growth · {period === 'week' ? '7 วัน' : '30 วัน'} vs ช่วงก่อน</h3>
      <div className="tt-talent-commerce-growth-grid">
        {growth.map((g) => (
          <div key={g.id} className="tt-talent-commerce-growth-card">
            <span>{g.label}</span>
            <strong>
              {g.current}
              <small>
                {g.delta >= 0 ? '+' : ''}
                {g.delta}
                {g.deltaPct != null ? ` (${g.deltaPct >= 0 ? '+' : ''}${g.deltaPct}%)` : ''}
              </small>
            </strong>
            <span className="tt-hint">ก่อนหน้า {g.previous}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
