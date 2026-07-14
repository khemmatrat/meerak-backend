'use client';

import { Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { MpSettingsSubHeader } from '@/components/mobile/MpSettingsUi';

function PasswordInner() {
  const params = useSearchParams();
  const embed = params.get('embed') === '1';
  const suffix = embed ? '?embed=1' : '';
  const backHref = embed ? '/m/account/settings/security?embed=1' : '/m/account/settings/security';

  return (
    <div className="tt-mp-settings">
      <MpSettingsSubHeader title="เปลี่ยนรหัสผ่าน" backHref={backHref} />
      <div className="tt-mp-settings-stub">
        <p>เปลี่ยนรหัสผ่านผ่าน OTP ที่หน้าเข้าสู่ระบบ</p>
        <Link href={`/m/login${suffix}`} className="tt-btn-primary">
          ไปหน้าเข้าสู่ระบบ
        </Link>
      </div>
    </div>
  );
}

export default function Page() {
  return (
    <Suspense fallback={<p className="tt-loading">กำลังโหลด...</p>}>
      <PasswordInner />
    </Suspense>
  );
}
