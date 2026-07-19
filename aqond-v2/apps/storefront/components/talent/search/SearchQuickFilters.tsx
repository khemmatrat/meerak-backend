'use client';

import type { TalentSearchFilterId } from '@/lib/talent/talentSearchTypes';
import { TALENT_SEARCH_QUICK_FILTERS } from '@/lib/talent/talentSearchTypes';

type Props = {
  active: TalentSearchFilterId;
  onChange: (filter: TalentSearchFilterId) => void;
};

export function SearchQuickFilters({ active, onChange }: Props) {
  return (
    <div className="tt-talent-search-filters" role="tablist" aria-label="Quick filters">
      {TALENT_SEARCH_QUICK_FILTERS.map((f) => (
        <button
          key={f.id}
          type="button"
          role="tab"
          className={active === f.id ? 'active' : ''}
          aria-selected={active === f.id}
          onClick={() => onChange(f.id)}
        >
          <span aria-hidden>{f.icon}</span>
          <span>{f.label}</span>
        </button>
      ))}
    </div>
  );
}
