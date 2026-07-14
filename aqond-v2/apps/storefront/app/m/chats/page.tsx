'use client';

import { Suspense } from 'react';
import { ShopChatsInboxClient } from '@/components/mobile/ShopChatsInboxClient';

export default function ShopChatsPage() {
  return (
    <Suspense fallback={<p className="tt-loading">กำลังโหลดแชท...</p>}>
      <ShopChatsInboxClient />
    </Suspense>
  );
}
