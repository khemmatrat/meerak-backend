'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Badge, EmptyState } from '@aqond/ui';
import { useCartOwner } from '@/lib/cartOwner';
import { fetchFoodCart } from '@/lib/food';
import { AxsFoodHomeLoading } from '@/components/axs/food/AxsFoodHomeLoading';
import { TtFoodHomeHeader } from '@/components/mobile/TtFoodHomeHeader';
import { TtFoodBannerCarousel } from '@/components/mobile/TtFoodBannerCarousel';
import { TtFoodCategoryRow } from '@/components/mobile/TtFoodCategoryRow';
import { TtFoodSectionRail } from '@/components/mobile/TtFoodSectionRail';
import { TtFoodBrandGrid } from '@/components/mobile/TtFoodBrandGrid';
import { TtFoodPromoStrip } from '@/components/mobile/TtFoodPromoStrip';
import { TtFoodRestaurantCard } from '@/components/mobile/TtFoodRestaurantCard';
import { TtFoodCartBar } from '@/components/mobile/TtFoodCartBar';
import type { FoodRestaurantView } from '@/lib/food';

type FoodHomeFeed = {
  location_label: string;
  banners: Array<{ id: string; title: string; subtitle?: string; image_url: string; badge?: string }>;
  categories: Array<{ id: string; label: string; emoji: string; filter: string }>;
  brands: Array<{ id: string; name: string; logo_emoji: string; merchant_id: string; cover_url?: string }>;
  sections: Array<{ id: string; title: string; subtitle?: string; icon?: string; restaurant_ids: string[] }>;
  promo_strip: { title: string; subtitle: string; code?: string };
  restaurants: FoodRestaurantView[];
};

const CATEGORY_FILTERS: Record<string, (r: FoodRestaurantView, filter: string) => boolean> = {
  thai: (r, f) => r.cuisine.includes(f) || (r.tags || []).some((t) => /ไทย|ผัด|ต้ม/.test(t)),
  noodle: (r, f) => r.cuisine.includes(f) || (r.tags || []).some((t) => /ก๋วย|เส้น|noodle/i.test(t)),
  japanese: (r, f) => r.cuisine.includes(f) || (r.tags || []).some((t) => /ซูชิ|ญี่ปุ่น/i.test(t)),
  cafe: (r, f) => r.cuisine.includes(f) || /matcha|คาเฟ่|เบเกอรี่/i.test(r.cuisine),
  pizza: (r, f) => r.cuisine.includes(f) || (r.tags || []).some((t) => /pizza|พิซ/i.test(t)),
  dessert: (r, f) => /เบเกอรี่|หวาน|dessert/i.test(r.cuisine),
  healthy: (r, f) => /สุขภาพ|สลัด/i.test(r.cuisine),
  street: (r, f) => /สตรีท|ข้าว/i.test(r.cuisine) || r.cuisine.includes(f),
};

export default function MobileFoodPage() {
  const { ownerId, ready } = useCartOwner();
  const [feed, setFeed] = useState<FoodHomeFeed | null>(null);
  const [cart, setCart] = useState<Awaited<ReturnType<typeof fetchFoodCart>> | null>(null);
  const [loading, setLoading] = useState(true);
  const [serviceMode, setServiceMode] = useState<'delivery' | 'pickup'>('delivery');
  const [categoryId, setCategoryId] = useState<string | undefined>();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/bff/v1/food/home', { cache: 'no-store' });
      const data = await res.json();
      setFeed(data);
    } catch {
      setFeed(null);
    }
    try {
      if (ownerId) setCart(await fetchFoodCart(ownerId));
    } catch {
      setCart(null);
    }
    setLoading(false);
  }, [ownerId]);

  useEffect(() => {
    if (!ready) return;
    void load();
  }, [load, ready]);

  const restaurantMap = useMemo(() => {
    const m = new Map<string, FoodRestaurantView>();
    for (const r of feed?.restaurants || []) m.set(r.id, r);
    return m;
  }, [feed?.restaurants]);

  const filteredList = useMemo(() => {
    const all = feed?.restaurants || [];
    if (!categoryId) return all;
    const cat = feed?.categories.find((c) => c.id === categoryId);
    const fn = CATEGORY_FILTERS[categoryId];
    if (!cat || !fn) return all;
    return all.filter((r) => fn(r, cat.filter));
  }, [feed, categoryId]);

  const openCount = (feed?.restaurants || []).filter((r) => r.open).length;

  return (
    <div className="tt-food-home-page">
      <TtFoodHomeHeader
        locationLabel={feed?.location_label || 'อาคารพาณิชย์'}
        cartCount={cart?.count}
        mode={serviceMode}
        onModeChange={setServiceMode}
      />

      {loading && <AxsFoodHomeLoading />}

      {!loading && !feed && (
        <EmptyState
          icon="🍜"
          title="โหลดร้านไม่สำเร็จ"
          description="ลองรีเฟรชหรือตรวจสอบการเชื่อมต่ออินเทอร์เน็ต"
          actionLabel="ลองอีกครั้ง"
          onAction={() => void load()}
        />
      )}

      {!loading && feed && (
        <>
          <TtFoodBannerCarousel banners={feed.banners} />
          <TtFoodCategoryRow
            categories={feed.categories}
            activeId={categoryId}
            onSelect={(id) => setCategoryId((prev) => (prev === id ? undefined : id))}
          />

          {!categoryId &&
            feed.sections.map((section) => (
              <TtFoodSectionRail
                key={section.id}
                title={section.title}
                subtitle={section.subtitle}
                icon={section.icon}
                restaurants={section.restaurant_ids
                  .map((id) => restaurantMap.get(id))
                  .filter(Boolean) as FoodRestaurantView[]}
              />
            ))}

          {!categoryId && <TtFoodBrandGrid brands={feed.brands} />}

          <section className="tt-food-section">
            <div className="tt-food-section-head">
              <h2>
                {categoryId ? 'ผลลัพธ์ตามหมวด' : 'ร้านทั้งหมดใกล้คุณ'}
                <Badge tone="success" className="axs-food-open-badge">
                  {openCount} ร้านเปิด
                </Badge>
              </h2>
              <p>รถเข็นอาหารแยกจากสินค้า</p>
            </div>
            <div className="tt-food-list tt-food-list--pro">
              {filteredList.map((r, i) => (
                <TtFoodRestaurantCard key={r.id} restaurant={r} showAd={i < 2} />
              ))}
            </div>
          </section>
        </>
      )}

      <TtFoodCartBar cart={cart} />
      {feed?.promo_strip && (
        <TtFoodPromoStrip
          title={feed.promo_strip.title}
          subtitle={feed.promo_strip.subtitle}
          code={feed.promo_strip.code}
        />
      )}
    </div>
  );
}
