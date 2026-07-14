'use client';

import { Suspense } from 'react';
import { MpSettingsStubPage } from '@/components/mobile/MpSettingsStubPage';

export default function Page() {
  return (
    <Suspense fallback={<p className="tt-loading">กำลังโหลด...</p>}>
      <MpSettingsStubPage title="นโยบายของ AQOND" body="นโยบายความเป็นส่วนตัวจะเผยแพร่เร็วๆ นี้" />
    </Suspense>
  );
}
