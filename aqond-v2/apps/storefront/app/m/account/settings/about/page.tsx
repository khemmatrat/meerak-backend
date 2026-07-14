'use client';

import { Suspense } from 'react';
import { MpSettingsStubPage } from '@/components/mobile/MpSettingsStubPage';

export default function Page() {
  return (
    <Suspense fallback={<p className="tt-loading">กำลังโหลด...</p>}>
      <MpSettingsStubPage
        title="เกี่ยวกับ"
        body="AQOND Marketplace — แพลตฟอร์มช้อปปิ้งและบริการครบวงจร"
      />
    </Suspense>
  );
}
