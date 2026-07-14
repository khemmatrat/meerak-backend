'use client';

import { Suspense, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { fetchAccountSettings, saveAccountSettings, type AccountSettingsData } from '@/lib/accountSettings';
import { MpSettingsSubHeader } from '@/components/mobile/MpSettingsUi';

function SocialInner() {
  const { auth, user } = useAuth();
  const params = useSearchParams();
  const embed = params.get('embed') === '1';
  const suffix = embed ? '?embed=1' : '';
  const backHref = embed ? '/m/account/settings/security?embed=1' : '/m/account/settings/security';
  const [data, setData] = useState<AccountSettingsData | null>(null);

  const load = useCallback(async () => {
    if (!auth?.userId) return;
    setData(await fetchAccountSettings(auth.userId, { phone: user?.phone, email: user?.email }));
  }, [auth?.userId, user?.email, user?.phone]);

  useEffect(() => {
    void load();
  }, [load]);

  const toggle = (key: 'social_apple' | 'social_line' | 'social_google') => {
    if (!auth?.userId || !data) return;
    const next = !data.profile[key];
    void saveAccountSettings(auth.userId, { profile: { [key]: next } }).then(setData);
  };

  if (!auth) {
    return (
      <div className="tt-mp-settings">
        <MpSettingsSubHeader title="บัญชีโซเชียลมีเดีย" backHref={backHref} />
        <p className="tt-hint" style={{ padding: 24, textAlign: 'center' }}>
          <Link href={`/m/login${suffix}`}>เข้าสู่ระบบ</Link>
        </p>
      </div>
    );
  }

  const p = data?.profile;
  const rows = [
    { key: 'social_apple' as const, label: 'Apple' },
    { key: 'social_line' as const, label: 'LINE' },
    { key: 'social_google' as const, label: 'Google' },
  ];

  return (
    <div className="tt-mp-settings">
      <MpSettingsSubHeader title="บัญชีโซเชียลมีเดีย" backHref={backHref} />
      <div className="tt-mp-settings-body">
        <div className="tt-mp-settings-card">
          {rows.map((r) => (
            <div key={r.key} className="tt-mp-settings-row tt-mp-settings-row-rich tt-mp-settings-row-toggle">
              <span>{r.label}</span>
              <button
                type="button"
                className={`tt-mp-settings-switch${p?.[r.key] ? ' on' : ''}`}
                onClick={() => toggle(r.key)}
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function Page() {
  return (
    <Suspense fallback={<p className="tt-loading">กำลังโหลด...</p>}>
      <SocialInner />
    </Suspense>
  );
}
