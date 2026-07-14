'use client';

import { Suspense } from 'react';
import { ShopChatClient } from '@/components/mobile/ShopChatClient';
import { useParams } from 'next/navigation';

function ShopChatInner() {
  const params = useParams();
  const shopId = String(params.shopId || '');
  return <ShopChatClient shopId={shopId} />;
}

export default function ShopChatPage() {
  return (
    <Suspense fallback={<p className="tt-loading">กำลังโหลดแชท...</p>}>
      <ShopChatInner />
    </Suspense>
  );
}
