'use client';

import { useState } from 'react';
import Link from 'next/link';
import { TtVisualSearchModal } from '@/components/mobile/TtVisualSearchModal';
import { IconLuxCamera, IconLuxSearch } from '@/components/mobile/TtLuxuryIcons';

export function TtHomeSearchBar({ category }: { category?: string }) {
  const [visualOpen, setVisualOpen] = useState(false);

  return (
    <>
      <div className="tt-header-row">
        <Link href="/m/search" className="tt-search-bar">
          <span className="tt-search-bar-icon" aria-hidden>
            <IconLuxSearch size={20} />
          </span>
          <span>ค้นหาสินค้า ร้านค้า...</span>
        </Link>
        <button
          type="button"
          className="tt-icon-btn tt-icon-accent"
          title="ค้นหา/สั่งจากรูปภาพ"
          aria-label="ค้นหาจากรูปภาพ"
          onClick={() => setVisualOpen(true)}
        >
          <IconLuxCamera size={22} />
        </button>
      </div>
      <TtVisualSearchModal
        open={visualOpen}
        onClose={() => setVisualOpen(false)}
        uiMode="order"
        title="ค้นหา/สั่งจากรูปภาพ"
        category={category && category !== 'all' ? category : undefined}
      />
    </>
  );
}
