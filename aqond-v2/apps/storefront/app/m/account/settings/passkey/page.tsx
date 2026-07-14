'use client';

import { Suspense, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { fetchAccountSettings, saveAccountSettings } from '@/lib/accountSettings';
import { MpSettingsSubHeader } from '@/components/mobile/MpSettingsUi';

function PasskeyInner() {
  const { auth, user } = useAuth();
  const params = useSearchParams();
  const embed = params.get('embed') === '1';
  const suffix = embed ? '?embed=1' : '';
  const backHref = embed ? '/m/account/settings/security?embed=1' : '/m/account/settings/security';
  const [configured, setConfigured] = useState(false);

  const load = useCallback(async () => {
    if (!auth?.userId) return;
    const d = await fetchAccountSettings(auth.userId, { phone: user?.phone });
    setConfigured(!!d.profile.passkey_configured);
  }, [auth?.userId, user?.phone]);

  useEffect(() => {
    void load();
  }, [load]);

  const setup = () => {
    if (!auth?.userId) return;
    void saveAccountSettings(auth.userId, { profile: { passkey_configured: true } }).then((d) =>
      setConfigured(d.profile.passkey_configured),
    );
  };

  if (!auth) {
    return (
      <div className="tt-mp-settings">
        <MpSettingsSubHeader title="พาสคีย์" backHref={backHref} />
        <p className="tt-hint" style={{ padding: 24, textAlign: 'center' }}>
          <Link href={`/m/login${suffix}`}>เข้าสู่ระบบ</Link>
        </p>
      </div>
    );
  }

  return (
    <div className="tt-mp-settings">
      <MpSettingsSubHeader title="พาสคีย์" backHref={backHref} />
      <div className="tt-mp-settings-stub">
        <p>
          {configured
            ? 'พาสคีย์ถูกตั้งค่าแล้วบนอุปกรณ์นี้'
            : 'ใช้ Face ID / Touch ID เข้าสู่ระบบได้รวดเร็วและปลอดภัย'}
        </p>
        {!configured && (
          <button type="button" className="tt-btn-primary" onClick={setup}>
            ตั้งค่าเลย
          </button>
        )}
      </div>
    </div>
  );
}

export default function Page() {
  return (
    <Suspense fallback={<p className="tt-loading">กำลังโหลด...</p>}>
      <PasskeyInner />
    </Suspense>
  );
}
