'use client';

import Link from 'next/link';
import { useMemo, type ReactNode } from 'react';
import { TtProductGrid } from '@/components/mobile/TtProductGrid';
import { TtPromoBar } from '@/components/mobile/TtPromoBar';
import { ContextualHomeBanner } from '@/components/growth/ContextualHomeBanner';
import { Top10MerchantsCarousel } from '@/components/growth/Top10MerchantsCarousel';
import { WalletTrustBadge } from '@/components/growth/WalletTrustBadge';
import { MysteryBoxHomeWidget } from '@/components/growth/MysteryBoxHomeWidget';
import { AqondPassCard } from '@/components/growth/AqondPassCard';
import { FtxDiscoverCards } from '@/components/experience/FtxDiscoverCards';
import { LuxuryHubIcon } from '@/components/mobile/TtLuxuryIcons';
import { resolveHomeSectionOrder, type HomeSectionId } from '@/lib/experience/homeModuleOrder';
import { useExperienceState } from '@/lib/experience/useExperienceState';
import { useFtxActive } from '@/lib/experience/useFtxActive';

type FtxHomePersonalizedModulesProps = {
  freshProducts: any[];
  restProducts: any[];
  products: any[];
  promos: any[];
};

export function FtxHomePersonalizedModules({
  freshProducts,
  restProducts,
  products,
  promos,
}: FtxHomePersonalizedModulesProps) {
  const ftxActive = useFtxActive();
  const { state } = useExperienceState('home', ftxActive);

  const sectionOrder = useMemo(() => {
    const modules = state?.personalization?.modules || state?.intents?.moduleOrder;
    return resolveHomeSectionOrder(modules);
  }, [state]);

  const sections: Record<HomeSectionId, ReactNode> = {
    banner: (
      <div key="banner" data-ftx-tour="banner">
        {promos.length > 0 && <TtPromoBar promo={promos[0]} />}
        <ContextualHomeBanner />
      </div>
    ),
    wallet: (
      <div key="wallet" data-ftx-tour="wallet">
        <WalletTrustBadge />
      </div>
    ),
    mystery: (
      <div key="mystery" data-ftx-tour="mystery">
        <MysteryBoxHomeWidget />
      </div>
    ),
    pass: (
      <div key="pass" data-ftx-tour="pass">
        <AqondPassCard />
      </div>
    ),
    merchants: (
      <div key="merchants" data-ftx-tour="merchants">
        <Top10MerchantsCarousel />
      </div>
    ),
    food: (
      <Link key="food" href="/m/food" className="tt-food-home-banner" data-ftx-tour="food">
        <span className="tt-food-home-emoji tt-mp-lux-tile-icon" aria-hidden>
          <LuxuryHubIcon id="food" size={24} />
        </span>
        <div>
          <strong>ส่งอาหารใกล้เคียง</strong>
          <span>ร้านเปิด · ETA 25–35 นาที · รถเข็นแยก</span>
        </div>
        <span className="tt-food-home-go">›</span>
      </Link>
    ),
    feed: (
      <Link key="feed" href="/m/feed" className="ftx-home-feed-strip" data-ftx-tour="feed">
        <span className="tt-mp-lux-tile-icon" aria-hidden>
          <LuxuryHubIcon id="video" size={22} />
        </span>
        <div>
          <strong>ดูวิดีโอ & ฟีด</strong>
          <span>ค้นพบสินค้าและร้านจากคลิป</span>
        </div>
        <span className="tt-food-home-go">›</span>
      </Link>
    ),
    discover: (
      <div key="discover">
        <FtxDiscoverCards />
      </div>
    ),
    products: (
      <div key="products" data-ftx-tour="products">
        <h2 className="tt-section-title">สินค้าแนะนำ</h2>
        {freshProducts.length > 0 && (
          <>
            <p className="tt-home-fresh-label">🆕 ใหม่จากร้านค้า</p>
            <TtProductGrid products={freshProducts} />
          </>
        )}
        {restProducts.length > 0 && <TtProductGrid products={restProducts} />}
      </div>
    ),
  };

  return <>{sectionOrder.map((id) => sections[id])}</>;
}
