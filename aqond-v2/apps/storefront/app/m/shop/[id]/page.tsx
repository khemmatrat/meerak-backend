'use client';

import { MobileShopClient } from '@/components/mobile/MobileShopClient';
import { useParams } from 'next/navigation';

export default function ShopLandingPage() {
  const params = useParams();
  const shopId = String(params.id || '');
  return <MobileShopClient shopId={shopId} />;
}
