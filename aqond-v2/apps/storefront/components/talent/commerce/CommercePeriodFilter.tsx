'use client';

import type { TalentCommercePeriodId } from '@/lib/talent/commerce/talentCommerceTypes';

const PERIODS: { id: TalentCommercePeriodId; label: string }[] = [
  { id: 'week', label: '7 วัน' },
  { id: 'month', label: '30 วัน' },
];

type Props = {
  active: TalentCommercePeriodId;
  onChange: (period: TalentCommercePeriodId) => void;
};

export function CommercePeriodFilter({ active, onChange }: Props) {
  return (
    <div className="tt-talent-commerce-filters" role="tablist" aria-label="ช่วงเวลา">
      {PERIODS.map(({ id, label }) => (
        <button
          key={id}
          type="button"
          role="tab"
          aria-selected={active === id}
          className={active === id ? 'active' : undefined}
          onClick={() => onChange(id)}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
