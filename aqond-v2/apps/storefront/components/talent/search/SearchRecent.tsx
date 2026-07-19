'use client';

type Props = {
  items: string[];
  onSelect: (query: string) => void;
  onClear?: () => void;
};

export function SearchRecent({ items, onSelect, onClear }: Props) {
  if (!items.length) return null;

  return (
    <section className="tt-talent-search-section" aria-label="ค้นหาล่าสุด">
      <div className="tt-talent-search-section-head">
        <h3>ค้นหาล่าสุด</h3>
        {onClear ? (
          <button type="button" className="tt-talent-search-clear" onClick={onClear}>
            ล้าง
          </button>
        ) : null}
      </div>
      <div className="tt-talent-search-chips">
        {items.map((q) => (
          <button key={q} type="button" className="tt-talent-search-chip" onClick={() => onSelect(q)}>
            🕘 {q}
          </button>
        ))}
      </div>
    </section>
  );
}
