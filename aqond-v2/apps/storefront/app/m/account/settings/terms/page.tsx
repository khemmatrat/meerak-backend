'use client';

import { Suspense } from 'react';
import { MpSettingsStubPage } from '@/components/mobile/MpSettingsStubPage';

export default function Page() {
  return (
    <Suspense fallback={<p className="tt-loading">กำลังโหลด...</p>}>
      <MpSettingsStubPage title="กฎระเบียบในการใช้" body="เอกสารกฎระเบียบจะเผยแพร่เร็วๆ นี้" />
    </Suspense>
  );
}
