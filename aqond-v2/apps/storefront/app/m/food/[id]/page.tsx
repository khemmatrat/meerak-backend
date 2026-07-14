'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { EmptyState } from '@aqond/ui';
import { useCartOwner } from '@/lib/cartOwner';
import {
  addFoodToCart,
  etaShort,
  fetchFoodCart,
  fetchFoodMenu,
  type FoodCartView,
  type FoodMenuItem,
  type FoodRestaurantView,
} from '@/lib/food';
import type { FoodCartOptionLine } from '@/lib/foodOptions';
import { formatOptionsSummary } from '@/lib/foodOptions';
import { formatCatalogPrice } from '@/lib/format';
import { TtProductThumb } from '@/components/mobile/TtProductThumb';
import { restaurantCoverUrl } from '@/lib/foodVisual';
import { TtFoodCartBar } from '@/components/mobile/TtFoodCartBar';
import { TtFoodAddSheet } from '@/components/mobile/TtFoodAddSheet';
import { AxsFoodCartLoading } from '@/components/axs/food/AxsFoodCartLoading';

export default function MobileFoodRestaurantPage() {
  const router = useRouter();
  const params = useParams();
  const merchantId = String(params.id || '');
  const { ownerId, ready } = useCartOwner();

  const [restaurant, setRestaurant] = useState<FoodRestaurantView | null>(null);
  const [menu, setMenu] = useState<FoodMenuItem[]>([]);
  const [cart, setCart] = useState<FoodCartView | null>(null);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState<string | null>(null);
  const [toast, setToast] = useState('');
  const [sheetItem, setSheetItem] = useState<FoodMenuItem | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchFoodMenu(merchantId);
      setRestaurant(data.restaurant);
      setMenu(data.menu);
    } catch {
      setRestaurant(null);
      setMenu([]);
    }
    try {
      if (ownerId) setCart(await fetchFoodCart(ownerId));
    } catch {
      setCart(null);
    }
    setLoading(false);
  }, [merchantId, ownerId]);

  useEffect(() => {
    if (!ready) return;
    void load();
  }, [load, ready]);

  const showToast = (t: string) => {
    setToast(t);
    window.setTimeout(() => setToast(''), 2000);
  };

  const openAdd = (item: FoodMenuItem) => {
    if (!restaurant?.open || item.sold_out) return;
    setSheetItem(item);
  };

  const confirmAdd = async (selected: FoodCartOptionLine[]) => {
    if (!sheetItem || !ownerId) return;
    setAdding(sheetItem.id);
    try {
      const next = await addFoodToCart(ownerId, {
        merchant_id: merchantId,
        item_id: sheetItem.id,
        title: sheetItem.title,
        description: sheetItem.description,
        image_url: sheetItem.image_url,
        unit_price_micro: (sheetItem as any).promo_price_micro ?? sheetItem.price_micro,
        options: selected.length ? selected : undefined,
      });
      setCart(next);
      const shopCount = next.shop_count || 1;
      const extra = selected.length ? ` · ${formatOptionsSummary(selected)}` : '';
      showToast(
        shopCount > 1
          ? `เพิ่ม ${sheetItem.title}${extra} (${shopCount} ร้านในรถเข็น)`
          : `เพิ่ม ${sheetItem.title}${extra}`,
      );
      setSheetItem(null);
    } catch {
      showToast('เพิ่มไม่สำเร็จ');
    } finally {
      setAdding(null);
    }
  };

  if (loading) return <AxsFoodCartLoading />;

  if (!restaurant) {
    return (
      <EmptyState
        icon="🍽️"
        title="ไม่พบร้านนี้"
        description="ร้านอาจปิดหรือถูกลบออกจากระบบแล้ว"
        actionLabel="กลับรายการร้าน"
        onAction={() => router.push('/m/food')}
      />
    );
  }

  return (
    <>
      <div className="tt-food-hero">
        {restaurantCoverUrl(merchantId) ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={restaurantCoverUrl(merchantId)} alt="" className="tt-food-hero-img" />
        ) : (
          <div className="tt-food-hero-fallback" aria-hidden>{restaurant.emoji}</div>
        )}
        <div className="tt-food-hero-overlay" />
      </div>

      <header className="tt-header tt-food-header tt-food-header-over-hero">
        <div className="tt-header-row">
          <Link href="/m/food" className="tt-back" aria-label="กลับ">‹</Link>
          <span style={{ flex: 1, fontWeight: 700, fontSize: '1rem' }}>{restaurant.name}</span>
          <span className="tt-food-eta-pill">{etaShort(restaurant.eta)}</span>
        </div>
        <p className="tt-food-loc">
          {restaurant.emoji} {restaurant.cuisine} · ⭐ {restaurant.rating} · {restaurant.distance_km.toFixed(1)} กม.
        </p>
        {(cart?.shop_count || 0) > 0 && (
          <p className="tt-food-multi-hint">
            รถเข็นมี {cart?.shop_count} ร้าน — เพิ่มจากร้านนี้ได้เลย
          </p>
        )}
      </header>

      {!restaurant.open && (
        <p className="tt-food-closed-banner">ร้านปิดชั่วคราว — ดูเมนูได้แต่สั่งไม่ได้</p>
      )}
      {(restaurant as any).busy_extra_min > 0 && restaurant.open && (
        <p className="tt-food-busy-banner">🔥 ร้านคิวเยอะ — เวลาเตรียม +{(restaurant as any).busy_extra_min} นาที</p>
      )}

      <div className="tt-food-menu">
        {menu.map((item) => (
          <div key={item.id} className={`tt-food-menu-item${item.sold_out ? ' sold-out' : ''}`}>
            <TtProductThumb
              category="food"
              title={item.title}
              imageUrl={item.image_url}
              className="tt-food-menu-thumb"
            />
            <div className="tt-food-menu-info">
              <h3>
                {item.title}
                {item.sold_out && <span className="tt-food-sold-out">ของหมด</span>}
                {item.popular && !item.sold_out && <span className="tt-food-pop">ยอดนิยม</span>}
                {item.spicy && <span className="tt-food-spicy">เผ็ด</span>}
              </h3>
              {item.description && <p>{item.description}</p>}
              {(item.options?.length || 0) > 0 && (
                <p className="tt-food-options-hint">มีตัวเลือกเสริม {item.options!.length} รายการ</p>
              )}
              {(item as any).discount_percent ? (
                <span className="tt-food-promo-price">
                  <strong>{formatCatalogPrice((item as any).promo_price_micro ?? item.price_micro)}</strong>
                  <span className="tt-food-price-was">{formatCatalogPrice(item.price_micro)}</span>
                  <span className="tt-food-promo-badge">−{(item as any).discount_percent}%</span>
                </span>
              ) : (
                <strong>{formatCatalogPrice(item.price_micro)}</strong>
              )}
            </div>
            <button
              type="button"
              className="tt-food-add"
              disabled={!restaurant.open || !!item.sold_out || adding === item.id}
              onClick={() => openAdd(item)}
            >
              {item.sold_out ? 'หมด' : adding === item.id ? '…' : '+'}
            </button>
          </div>
        ))}
      </div>

      <TtFoodAddSheet
        item={sheetItem}
        open={!!sheetItem}
        onClose={() => setSheetItem(null)}
        onConfirm={(sel) => void confirmAdd(sel)}
        adding={!!adding}
      />

      {toast && <p className="tt-feed-toast">{toast}</p>}
      <TtFoodCartBar cart={cart} />
    </>
  );
}
