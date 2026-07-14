'use client';

import { Suspense } from 'react';
import { MpSettingsStubPage } from '@/components/mobile/MpSettingsStubPage';

export default function Page() {
  return (
    <Suspense fallback={<p className="tt-loading">กำลังโหลด...</p>}>
      <MpSettingsStubPage title="ให้คะแนนแอป" body="ขอบคุณที่ใช้ AQOND Marketplace!" />
    </Suspense>
  );
}
