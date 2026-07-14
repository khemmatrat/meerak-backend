import Link from 'next/link';
import { Suspense } from 'react';
import { AxsMarketplaceHomeLoading } from '@/components/axs/marketplace/AxsMarketplaceHomeLoading';
import { AxsMarketplaceHomeSkeletonPaint } from '@/components/axs/marketplace/AxsMarketplaceHomeSkeletonPaint';
import { AxsHomeProductsReveal } from '@/components/axs/marketplace/AxsHomeProductsReveal';
import { AxsHomeProductsSection } from '@/components/axs/marketplace/AxsHomeProductsSection';
import { FtxHomeShell } from '@/components/experience/FtxHomeShell';

const CATEGORIES = [
  { id: '', slug: 'all', label: 'ทั้งหมด' },
  { id: 'cat-fashion', slug: 'fashion', label: 'แฟชั่น' },
  { id: 'cat-beauty', slug: 'beauty', label: 'ความงาม' },
  { id: 'cat-electronics', slug: 'electronics', label: 'อิเล็ก' },
  { id: 'cat-food', slug: 'food', label: 'อาหาร' },
  { id: 'cat-home', slug: 'home', label: 'บ้าน' },
  { id: 'cat-sports', slug: 'sports', label: 'กีฬา' },
];

export const dynamic = 'force-dynamic';

export default async function MobileHomePage({
  searchParams,
}: {
  searchParams: { cat?: string; pv_test?: string };
}) {
  const catFilter = searchParams?.cat || '';
  const searchCategory = catFilter && catFilter !== 'all' ? catFilter : undefined;

  return (
    <FtxHomeShell category={searchCategory}>
      <div className="tt-cat-scroll" data-ftx-tour="categories">
        {CATEGORIES.map((c) => {
          const active = (catFilter || 'all') === (c.slug || 'all');
          const href =
            c.slug === 'food'
              ? '/m/food'
              : c.slug === 'all' || !c.slug
                ? '/m/home'
                : `/m/home?cat=${c.slug}`;
          return (
            <Link key={c.slug || 'all'} href={href} className={`tt-cat-chip${active ? ' active' : ''}`}>
              {c.label}
            </Link>
          );
        })}
      </div>

      <AxsMarketplaceHomeSkeletonPaint />

      <Suspense fallback={<AxsMarketplaceHomeLoading />}>
        <AxsHomeProductsReveal>
          <AxsHomeProductsSection catFilter={catFilter} pvTest={searchParams?.pv_test} />
        </AxsHomeProductsReveal>
      </Suspense>
    </FtxHomeShell>
  );
}
