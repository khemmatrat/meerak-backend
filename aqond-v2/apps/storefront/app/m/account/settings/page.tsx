'use client';

import { Suspense } from 'react';
import { MpAccountSettingsClient } from '@/components/mobile/MpAccountSettingsClient';

export default function AccountSettingsPage() {
  return (
    <Suspense fallback={<p className="tt-loading">กำลังโหลด...</p>}>
      <MpAccountSettingsClient />
    </Suspense>
  );
}
