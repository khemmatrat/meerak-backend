'use client';

import { Suspense } from 'react';
import { MpAccountProfileEditClient } from '@/components/mobile/MpAccountProfileEditClient';

export default function Page() {
  return (
    <Suspense fallback={<p className="tt-loading">กำลังโหลด...</p>}>
      <MpAccountProfileEditClient />
    </Suspense>
  );
}
