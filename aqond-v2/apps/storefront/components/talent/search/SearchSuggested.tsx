'use client';

import type { TalentSearchSuggestion } from '@/lib/talent/talentSearchTypes';
import { TALENT_SEARCH_SUGGESTED } from '@/lib/talent/talentSearchTypes';

type Props = {
  onSelect: (suggestion: TalentSearchSuggestion) => void;
  items?: TalentSearchSuggestion[];
};

export function SearchSuggested({ onSelect, items = TALENT_SEARCH_SUGGESTED }: Props) {
  return (
    <section className="tt-talent-search-section" aria-label="คำแนะนำ">
      <h3 className="tt-talent-search-section-title">คำแนะนำ</h3>
      <div className="tt-talent-search-suggest-grid">
        {items.map((s) => (
          <button
            key={s.id}
            type="button"
            className="tt-talent-search-suggest-card"
            onClick={() => onSelect(s)}
          >
            <span aria-hidden>{s.icon}</span>
            <span>{s.label}</span>
          </button>
        ))}
      </div>
    </section>
  );
}
