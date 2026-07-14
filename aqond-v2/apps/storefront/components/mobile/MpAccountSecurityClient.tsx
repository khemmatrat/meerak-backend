'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import {
  fetchAccountSettings,
  saveAccountSettings,
  type AccountSettingsData,
} from '@/lib/accountSettings';
import {
  MpSettingsConfirmModal,
  MpSettingsFieldModal,
  MpSettingsSubHeader,
} from '@/components/mobile/MpSettingsUi';

function RowLink({
  label,
  value,
  href,
  sub,
  accent,
  dot,
}: {
  label: string;
  value?: string;
  href: string;
  sub?: string;
  accent?: boolean;
  dot?: boolean;
}) {
  return (
    <Link href={href} className="tt-mp-settings-row tt-mp-settings-row-rich">
      <div className="tt-mp-settings-row-main">
        <span>{label}</span>
        {sub && <small>{sub}</small>}
      </div>
      <div className="tt-mp-settings-row-end">
        {value && <span className={accent ? 'tt-mp-settings-accent' : 'tt-mp-settings-value'}>{value}</span>}
        {dot && <em className="tt-mp-settings-dot" />}
        <span className="tt-mp-settings-chevron">›</span>
      </div>
    </Link>
  );
}

function RowButton({
  label,
  value,
  sub,
  accent,
  onClick,
}: {
  label: string;
  value?: string;
  sub?: string;
  accent?: boolean;
  onClick: () => void;
}) {
  return (
    <button type="button" className="tt-mp-settings-row tt-mp-settings-row-rich" onClick={onClick}>
      <div className="tt-mp-settings-row-main">
        <span>{label}</span>
        {sub && <small>{sub}</small>}
      </div>
      <div className="tt-mp-settings-row-end">
        {value && <span className={accent ? 'tt-mp-settings-accent' : 'tt-mp-settings-value'}>{value}</span>}
        <span className="tt-mp-settings-chevron">›</span>
      </div>
    </button>
  );
}

function RowToggle({
  label,
  sub,
  on,
  onChange,
}: {
  label: string;
  sub?: string;
  on: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="tt-mp-settings-row tt-mp-settings-row-rich tt-mp-settings-row-toggle">
      <div className="tt-mp-settings-row-main">
        <span>{label}</span>
        {sub && <small>{sub}</small>}
      </div>
      <button
        type="button"
        className={`tt-mp-settings-switch${on ? ' on' : ''}`}
        role="switch"
        aria-checked={on}
        onClick={() => onChange(!on)}
      />
    </div>
  );
}

export function MpAccountSecurityClient() {
  const { auth, user } = useAuth();
  const params = useSearchParams();
  const embed = params.get('embed') === '1';
  const suffix = embed ? '?embed=1' : '';
  const chatHref = embed ? '/m/chats?embed=1' : '/m/chats';
  const backHref = embed ? '/m/account/settings?embed=1' : '/m/account/settings';

  const [data, setData] = useState<AccountSettingsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [usernameModal, setUsernameModal] = useState(false);
  const [usernameConfirm, setUsernameConfirm] = useState(false);
  const [usernameDraft, setUsernameDraft] = useState('');
  const [emailModal, setEmailModal] = useState(false);
  const [phoneModal, setPhoneModal] = useState(false);

  const load = useCallback(async () => {
    if (!auth?.userId) return;
    const d = await fetchAccountSettings(auth.userId, {
      phone: user?.phone,
      email: user?.email,
      name: user?.name,
    });
    setData(d);
  }, [auth?.userId, user?.email, user?.name, user?.phone]);

  useEffect(() => {
    if (!auth) {
      setLoading(false);
      return;
    }
    load()
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [auth, load]);

  const saveProfile = async (profile: Record<string, unknown>) => {
    if (!auth?.userId) return;
    const d = await saveAccountSettings(auth.userId, { profile });
    setData(d);
  };

  const onUsernameTap = () => {
    if (!data?.profile.username_can_change) return;
    setUsernameDraft(data.profile.username);
    setUsernameConfirm(true);
  };

  const onUsernameConfirmed = () => {
    setUsernameConfirm(false);
    setUsernameModal(true);
  };

  const p = data?.profile;

  if (!auth) {
    return (
      <div className="tt-mp-settings">
        <MpSettingsSubHeader title="บัญชีและความปลอดภัยของบัญชี" backHref={backHref} />
        <p className="tt-hint" style={{ padding: 24, textAlign: 'center' }}>
          <Link href={`/m/login${suffix}`}>เข้าสู่ระบบ</Link> เพื่อจัดการบัญชี
        </p>
      </div>
    );
  }

  return (
    <div className="tt-mp-settings">
      <MpSettingsSubHeader title="บัญชีและความปลอดภัยของบัญชี" backHref={backHref} chatHref={chatHref} />

      {loading && <p className="tt-loading">กำลังโหลด...</p>}

      {!loading && p && (
        <div className="tt-mp-settings-body">
          <section className="tt-mp-settings-section">
            <h2>บัญชีผู้ใช้</h2>
            <div className="tt-mp-settings-card">
              <RowLink label="โปรไฟล์" href={`/m/account/settings/profile${suffix}`} />
              <RowButton label="ชื่อผู้ใช้" value={p.username} onClick={onUsernameTap} />
              <RowButton
                label="โทรศัพท์"
                value={p.phone_masked || 'ตั้งค่า'}
                onClick={() => setPhoneModal(true)}
              />
              <RowButton
                label="อีเมล"
                value={p.email_masked || 'ตั้งค่า'}
                onClick={() => setEmailModal(true)}
              />
              <RowLink
                label="บัญชีโซเชียลมีเดีย"
                href={`/m/account/settings/social${suffix}`}
              />
              <RowLink label="เปลี่ยนรหัสผ่าน" href={`/m/account/settings/password${suffix}`} />
              <RowLink
                label="พาสคีย์"
                value={p.passkey_configured ? 'ตั้งค่าแล้ว' : 'ตั้งค่าเลย'}
                href={`/m/account/settings/passkey${suffix}`}
                accent={!p.passkey_configured}
              />
              <RowToggle
                label="การเข้าสู่ระบบแบบรวดเร็ว"
                sub={`เปิดการใช้งานกับอุปกรณ์นี้: ${p.quick_login_provider}`}
                on={p.quick_login_enabled}
                onChange={(v) => void saveProfile({ quick_login_enabled: v })}
              />
            </div>
          </section>

          <section className="tt-mp-settings-section">
            <h2>ความปลอดภัย</h2>
            <div className="tt-mp-settings-card">
              <RowLink
                label="ตรวจสอบการดำเนินการในบัญชี"
                sub="ตรวจสอบการเข้าสู่ระบบและการแก้ไขข้อมูลในบัญชีในช่วง 30 วันที่ผ่านมา"
                href={`/m/account/settings/activity${suffix}`}
              />
              <RowLink
                label="จัดการข้อมูลอุปกรณ์"
                sub="ดูอุปกรณ์ทั้งหมดที่คุณใช้บัญชีนี้เข้าสู่ระบบ"
                href={`/m/account/settings/devices${suffix}`}
                dot={data?.device_alert}
              />
            </div>
          </section>
        </div>
      )}

      <MpSettingsConfirmModal
        open={usernameConfirm}
        message="คุณสามารถเปลี่ยนชื่อผู้ใช้ได้เพียง 1 ครั้งเท่านั้น กรุณาตรวจสอบให้แน่ใจว่าต้องการใช้ชื่อผู้ใช้นี้"
        onCancel={() => setUsernameConfirm(false)}
        onConfirm={onUsernameConfirmed}
      />

      <MpSettingsFieldModal
        open={usernameModal}
        title="เปลี่ยนชื่อผู้ใช้"
        label="ชื่อผู้ใช้"
        value={usernameDraft}
        onClose={() => setUsernameModal(false)}
        onSave={async (v) => {
          await saveProfile({ username: v.trim() });
        }}
      />

      <MpSettingsFieldModal
        open={phoneModal}
        title="เบอร์โทรศัพท์"
        label="โทรศัพท์"
        value={p?.phone || ''}
        onClose={() => setPhoneModal(false)}
        onSave={async (v) => {
          await saveProfile({ phone: v.trim() });
        }}
      />

      <MpSettingsFieldModal
        open={emailModal}
        title="อีเมล"
        label="อีเมล"
        value={p?.email || ''}
        onClose={() => setEmailModal(false)}
        onSave={async (v) => {
          await saveProfile({ email: v.trim() });
        }}
      />
    </div>
  );
}
