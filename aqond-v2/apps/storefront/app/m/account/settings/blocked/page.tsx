'use client';

import { Suspense } from 'react';
import { MpSettingsStubPage } from '@/components/mobile/MpSettingsStubPage';

export default function Page() {
  return (
    <Suspense fallback={<p className="tt-loading">กำลังโหลด...</p>}>
      <MpSettingsStubPage title="ผู้ใช้ที่ถูกระงับ" body="ยังไม่มีผู้ใช้ที่ถูกระงับ" />
    </Suspense>
  );
}
