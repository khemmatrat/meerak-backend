'use client';

import { Suspense } from 'react';
import { MpAccountPaymentClient } from '@/components/mobile/MpAccountPaymentClient';

export default function Page() {
  return (
    <Suspense fallback={<p className="tt-loading">กำลังโหลด...</p>}>
      <MpAccountPaymentClient />
    </Suspense>
  );
}
