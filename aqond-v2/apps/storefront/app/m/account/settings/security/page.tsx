'use client';

import { Suspense } from 'react';
import { MpAccountSecurityClient } from '@/components/mobile/MpAccountSecurityClient';

export default function Page() {
  return (
    <Suspense fallback={<p className="tt-loading">กำลังโหลด...</p>}>
      <MpAccountSecurityClient />
    </Suspense>
  );
}
