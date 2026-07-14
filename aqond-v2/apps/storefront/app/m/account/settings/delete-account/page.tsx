'use client';

import { Suspense } from 'react';
import { MpSettingsStubPage } from '@/components/mobile/MpSettingsStubPage';

export default function Page() {
  return (
    <Suspense fallback={<p className="tt-loading">กำลังโหลด...</p>}>
      <MpSettingsStubPage
        title="คำขอลบบัญชีผู้ใช้"
        body="ส่งคำขอลบบัญชีผ่านศูนย์ช่วยเหลือ ทีมงานจะดำเนินการภายใน 7 วันทำการ"
      />
    </Suspense>
  );
}
