'use client';

import { useEffect } from 'react';
import { useParams } from 'next/navigation';
import { ShopVideoFeed } from '@/components/mobile/ShopVideoFeed';

export default function ShopVideosPage() {
  const params = useParams();
  const shopId = String(params.id || '');

  useEffect(() => {
    document.body.classList.add('tt-shop-video-page');
    return () => document.body.classList.remove('tt-shop-video-page');
  }, []);

  return <ShopVideoFeed shopId={shopId} />;
}
