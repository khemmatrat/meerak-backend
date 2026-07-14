'use client';

type Category = {
  id: string;
  label: string;
  emoji: string;
};

type Props = {
  categories: Category[];
  activeId?: string;
  onSelect: (id: string) => void;
};

export function TtFoodCategoryRow({ categories, activeId, onSelect }: Props) {
  return (
    <section className="tt-food-cat-scroll" aria-label="หมวดหมู่ยอดนิยม">
      {categories.map((c) => (
        <button
          key={c.id}
          type="button"
          className={`tt-food-cat-chip${activeId === c.id ? ' is-on' : ''}`}
          onClick={() => onSelect(c.id)}
        >
          <span className="tt-food-cat-emoji" aria-hidden>{c.emoji}</span>
          <span>{c.label}</span>
        </button>
      ))}
    </section>
  );
}
