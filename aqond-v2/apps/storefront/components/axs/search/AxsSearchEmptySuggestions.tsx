'use client';

import { CATEGORY_OPTIONS } from '@/lib/search';
import { SEARCH_SUGGESTED_QUERIES } from '@/lib/searchCatalogMatch';

type AxsSearchEmptySuggestionsProps = {
  query: string;
  onPickQuery: (q: string) => void;
  onPickCategory: (categoryId: string) => void;
};

export function AxsSearchEmptySuggestions({
  query,
  onPickQuery,
  onPickCategory,
}: AxsSearchEmptySuggestionsProps) {
  return (
    <div className="axs-search-empty" data-testid="search-empty-suggestions">
      <p className="axs-search-empty-title">ไม่พบ &quot;{query}&quot;</p>
      <p className="axs-search-empty-desc">ลองคำค้นอื่นหรือเลือกหมวดหมู่ด้านล่าง</p>
      <div className="axs-search-empty-section">
        <span className="axs-search-empty-label">คำค้นยอดนิยม</span>
        <div className="axs-search-empty-chips">
          {SEARCH_SUGGESTED_QUERIES.map((s) => (
            <button key={s} type="button" className="tt-filter-chip" onClick={() => onPickQuery(s)}>
              {s}
            </button>
          ))}
        </div>
      </div>
      <div className="axs-search-empty-section">
        <span className="axs-search-empty-label">หมวดหมู่</span>
        <div className="axs-search-empty-chips">
          {CATEGORY_OPTIONS.filter((c) => c.id).map((c) => (
            <button
              key={c.id}
              type="button"
              className="tt-filter-chip"
              onClick={() => onPickCategory(c.id)}
            >
              {c.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
