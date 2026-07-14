'use client';

import { Suspense } from 'react';
import { MpSettingsStubPage } from '@/components/mobile/MpSettingsStubPage';

export default function Page() {
  return (
    <Suspense fallback={<p className="tt-loading">กำลังโหลด...</p>}>
      <MpSettingsStubPage
        title="ศูนย์ช่วยเหลือ"
        body="ติดต่อทีม AQOND ผ่านแชทร้านค้าหรืออีเมล support@aqond.com"
      />
    </Suspense>
  );
}
