import Link from 'next/link';
import { TALENT_SEARCH_SOURCE_META } from '@/lib/talent/talentSearchTypes';
import type { TalentSearchResult } from '@/lib/talent/talentSearchTypes';

function formatMeta(iso?: string): string | undefined {
  if (!iso) return undefined;
  try {
    return new Intl.DateTimeFormat('th-TH', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(iso));
  } catch {
    return iso;
  }
}

type Props = {
  items: TalentSearchResult[];
  query: string;
};

export function SearchResults({ items, query }: Props) {
  if (!items.length) return null;

  return (
    <section className="tt-talent-search-section" aria-label="ผลการค้นหา">
      <h3 className="tt-talent-search-section-title">
        ผลลัพธ์{query.trim() ? ` · “${query.trim()}”` : ''} ({items.length})
      </h3>
      <ul className="tt-talent-search-results">
        {items.map((item) => {
          const sourceMeta = TALENT_SEARCH_SOURCE_META[item.source];
          const meta = item.meta && item.meta.includes('T') ? formatMeta(item.meta) : item.meta;
          return (
            <li key={item.id}>
              <Link href={item.href} className="tt-talent-search-result-card">
                <div className="tt-talent-search-result-top">
                  <span className="tt-talent-search-result-icon" aria-hidden>
                    {item.icon}
                  </span>
                  <div className="tt-talent-search-result-head">
                    <strong>{item.title}</strong>
                    <span className="tt-talent-search-result-source">{sourceMeta.label}</span>
                  </div>
                </div>
                {item.subtitle ? <p className="tt-talent-search-result-sub">{item.subtitle}</p> : null}
                {meta ? <span className="tt-talent-search-result-meta">{meta}</span> : null}
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
