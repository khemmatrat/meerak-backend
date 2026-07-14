'use client';

import { Suspense, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { fetchAccountSettings } from '@/lib/accountSettings';
import { MpSettingsSubHeader } from '@/components/mobile/MpSettingsUi';

function ActivityInner() {
  const { auth, user } = useAuth();
  const params = useSearchParams();
  const embed = params.get('embed') === '1';
  const suffix = embed ? '?embed=1' : '';
  const backHref = embed ? '/m/account/settings/security?embed=1' : '/m/account/settings/security';
  const [updatedAt, setUpdatedAt] = useState('');

  const load = useCallback(async () => {
    if (!auth?.userId) return;
    const d = await fetchAccountSettings(auth.userId, { phone: user?.phone });
    setUpdatedAt(d.profile.updated_at || '');
  }, [auth?.userId, user?.phone]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!auth) {
    return (
      <div className="tt-mp-settings">
        <MpSettingsSubHeader title="ตรวจสอบการดำเนินการในบัญชี" backHref={backHref} />
        <p className="tt-hint" style={{ padding: 24, textAlign: 'center' }}>
          <Link href={`/m/login${suffix}`}>เข้าสู่ระบบ</Link>
        </p>
      </div>
    );
  }

  return (
    <div className="tt-mp-settings">
      <MpSettingsSubHeader title="ตรวจสอบการดำเนินการในบัญชี" backHref={backHref} />
      <div className="tt-mp-settings-body">
        <div className="tt-mp-settings-card">
          <div className="tt-mp-settings-row tt-mp-settings-row-rich">
            <div className="tt-mp-settings-row-main">
              <span>เข้าสู่ระบบล่าสุด</span>
              <small>อุปกรณ์นี้</small>
            </div>
            <span className="tt-mp-settings-value">
              {updatedAt ? new Date(updatedAt).toLocaleString('th-TH') : '—'}
            </span>
          </div>
          <div className="tt-mp-settings-row tt-mp-settings-row-rich">
            <div className="tt-mp-settings-row-main">
              <span>แก้ไขโปรไฟล์ล่าสุด</span>
            </div>
            <span className="tt-mp-settings-value">
              {updatedAt ? new Date(updatedAt).toLocaleString('th-TH') : '—'}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function Page() {
  return (
    <Suspense fallback={<p className="tt-loading">กำลังโหลด...</p>}>
      <ActivityInner />
    </Suspense>
  );
}
