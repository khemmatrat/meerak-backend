'use client';

import { Suspense } from 'react';
import { MerchantAdStudioClient } from '@/components/mobile/MerchantAdStudioClient';
import { AxsMerchantLoading } from '@/components/axs/merchant/AxsMerchantLoading';

export default function MerchantAdStudioPage() {
  return (
    <Suspense fallback={<AxsMerchantLoading label="กำลังโหลดสตูดิโอวิดีโอ…" />}>
      <MerchantAdStudioClient />
    </Suspense>
  );
}
