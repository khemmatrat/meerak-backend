'use client';

import { Suspense, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { fetchAccountSettings, saveAccountSettings } from '@/lib/accountSettings';
import { MpSettingsSubHeader } from '@/components/mobile/MpSettingsUi';

function DevicesInner() {
  const { auth, user } = useAuth();
  const params = useSearchParams();
  const embed = params.get('embed') === '1';
  const suffix = embed ? '?embed=1' : '';
  const backHref = embed ? '/m/account/settings/security?embed=1' : '/m/account/settings/security';
  const [provider, setProvider] = useState('Apple');

  const load = useCallback(async () => {
    if (!auth?.userId) return;
    const d = await fetchAccountSettings(auth.userId, { phone: user?.phone });
    setProvider(d.profile.quick_login_provider || 'อุปกรณ์นี้');
    if (d.device_alert) {
      await saveAccountSettings(auth.userId, { device_alert: false });
    }
  }, [auth?.userId, user?.phone]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!auth) {
    return (
      <div className="tt-mp-settings">
        <MpSettingsSubHeader title="จัดการข้อมูลอุปกรณ์" backHref={backHref} />
        <p className="tt-hint" style={{ padding: 24, textAlign: 'center' }}>
          <Link href={`/m/login${suffix}`}>เข้าสู่ระบบ</Link>
        </p>
      </div>
    );
  }

  return (
    <div className="tt-mp-settings">
      <MpSettingsSubHeader title="จัดการข้อมูลอุปกรณ์" backHref={backHref} />
      <div className="tt-mp-settings-body">
        <div className="tt-mp-settings-card">
          <div className="tt-mp-settings-row tt-mp-settings-row-rich">
            <div className="tt-mp-settings-row-main">
              <span>อุปกรณ์ปัจจุบัน</span>
              <small>ใช้งานล่าสุด</small>
            </div>
            <span className="tt-mp-settings-value">{provider}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function Page() {
  return (
    <Suspense fallback={<p className="tt-loading">กำลังโหลด...</p>}>
      <DevicesInner />
    </Suspense>
  );
}
