'use client';

import type { FoodRestaurantView } from '@/lib/food';
import { TtFoodRestaurantCard } from '@/components/mobile/TtFoodRestaurantCard';

type Props = {
  title: string;
  subtitle?: string;
  icon?: string;
  restaurants: FoodRestaurantView[];
};

export function TtFoodSectionRail({ title, subtitle, icon, restaurants }: Props) {
  if (!restaurants.length) return null;
  return (
    <section className="tt-food-section">
      <div className="tt-food-section-head">
        <h2>
          {icon && <span aria-hidden>{icon} </span>}
          {title}
        </h2>
        {subtitle && <p>{subtitle}</p>}
      </div>
      <div className="tt-food-section-scroll">
        {restaurants.map((r) => (
          <TtFoodRestaurantCard key={r.id} restaurant={r} variant="rail" />
        ))}
      </div>
    </section>
  );
}
