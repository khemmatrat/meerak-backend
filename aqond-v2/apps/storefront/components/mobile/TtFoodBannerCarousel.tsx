'use client';

type Banner = {
  id: string;
  title: string;
  subtitle?: string;
  image_url: string;
  badge?: string;
};

type Props = {
  banners: Banner[];
};

export function TtFoodBannerCarousel({ banners }: Props) {
  if (!banners.length) return null;
  return (
    <section className="tt-food-banner-scroll" aria-label="โปรโมชั่น">
      {banners.map((b) => (
        <article key={b.id} className="tt-food-banner-card">
          <img src={b.image_url} alt="" className="tt-food-banner-img" loading="lazy" />
          <div className="tt-food-banner-overlay">
            {b.badge && <span className="tt-food-banner-badge">{b.badge}</span>}
            <strong>{b.title}</strong>
            {b.subtitle && <p>{b.subtitle}</p>}
          </div>
        </article>
      ))}
    </section>
  );
}
