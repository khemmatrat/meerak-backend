'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import {
  fetchAccountSettings,
  formatBirthday,
  profileFieldLabel,
  saveAccountSettings,
  type AccountSettingsData,
} from '@/lib/accountSettings';
import { MpSettingsFieldModal, MpSettingsSubHeader } from '@/components/mobile/MpSettingsUi';

type FieldKey = 'display_name' | 'bio' | 'gender' | 'birthday';

export function MpAccountProfileEditClient() {
  const { auth, user } = useAuth();
  const params = useSearchParams();
  const embed = params.get('embed') === '1';
  const suffix = embed ? '?embed=1' : '';
  const backHref = embed ? '/m/account/settings/security?embed=1' : '/m/account/settings/security';

  const [data, setData] = useState<AccountSettingsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [editField, setEditField] = useState<FieldKey | null>(null);

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

  const p = data?.profile;

  const saveField = async (field: FieldKey, value: string) => {
    if (!auth?.userId) return;
    const d = await saveAccountSettings(auth.userId, { profile: { [field]: value } });
    setData(d);
  };

  const fieldValue = (key: FieldKey): string => {
    if (!p) return '';
    if (key === 'birthday') return p.birthday ? formatBirthday(p.birthday) : '';
    return p[key] || '';
  };

  const fieldDraft = (key: FieldKey): string => {
    if (!p) return '';
    return p[key] || '';
  };

  if (!auth) {
    return (
      <div className="tt-mp-settings">
        <MpSettingsSubHeader title="แก้ไขโปรไฟล์" backHref={backHref} />
        <p className="tt-hint" style={{ padding: 24, textAlign: 'center' }}>
          <Link href={`/m/login${suffix}`}>เข้าสู่ระบบ</Link>
        </p>
      </div>
    );
  }

  return (
    <div className="tt-mp-settings tt-mp-profile-edit">
      <MpSettingsSubHeader title="แก้ไขโปรไฟล์" backHref={backHref} />

      {loading && <p className="tt-loading">กำลังโหลด...</p>}

      {!loading && p && (
        <div className="tt-mp-settings-body">
          <div className="tt-mp-profile-avatar-block">
            <div className="tt-mp-profile-avatar">
              {p.avatar_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={p.avatar_url} alt="" />
              ) : (
                <span>👤</span>
              )}
            </div>
            <button
              type="button"
              className="tt-mp-profile-avatar-edit"
              onClick={() => setEditField('display_name')}
            >
              ✎ แก้ไข
            </button>
          </div>

          <div className="tt-mp-settings-card tt-mp-profile-card">
            <button type="button" className="tt-mp-settings-row" onClick={() => setEditField('display_name')}>
              <span>ชื่อ</span>
              <span className={p.display_name ? 'tt-mp-settings-value' : 'tt-mp-settings-accent'}>
                {profileFieldLabel(p.display_name)} ›
              </span>
            </button>
            <button type="button" className="tt-mp-settings-row" onClick={() => setEditField('bio')}>
              <span>ประวัติ</span>
              <span className={p.bio ? 'tt-mp-settings-value' : 'tt-mp-settings-accent'}>
                {profileFieldLabel(p.bio)} ›
              </span>
            </button>
          </div>

          <div className="tt-mp-settings-card tt-mp-profile-card">
            <button type="button" className="tt-mp-settings-row" onClick={() => setEditField('gender')}>
              <span>เพศ</span>
              <span className={p.gender ? 'tt-mp-settings-value' : 'tt-mp-settings-accent'}>
                {profileFieldLabel(p.gender)} ›
              </span>
            </button>
            <button type="button" className="tt-mp-settings-row" onClick={() => setEditField('birthday')}>
              <span>วันเกิด</span>
              <span className={p.birthday ? 'tt-mp-settings-value' : 'tt-mp-settings-accent'}>
                {profileFieldLabel(fieldValue('birthday'))} ›
              </span>
            </button>
          </div>

          <div className="tt-mp-settings-card tt-mp-profile-card">
            <div className="tt-mp-settings-row tt-mp-settings-row-static">
              <span>โทรศัพท์</span>
              <span className="tt-mp-settings-value">{p.phone_masked || '—'}</span>
            </div>
            <div className="tt-mp-settings-row tt-mp-settings-row-static">
              <span>อีเมล</span>
              <span className="tt-mp-settings-value">{p.email_masked || '—'}</span>
            </div>
          </div>
        </div>
      )}

      <MpSettingsFieldModal
        open={editField === 'display_name'}
        title="ชื่อ"
        label="ชื่อที่แสดง"
        value={fieldDraft('display_name')}
        onClose={() => setEditField(null)}
        onSave={(v) => saveField('display_name', v.trim())}
      />
      <MpSettingsFieldModal
        open={editField === 'bio'}
        title="ประวัติ"
        label="แนะนำตัวสั้นๆ"
        value={fieldDraft('bio')}
        onClose={() => setEditField(null)}
        onSave={(v) => saveField('bio', v.trim())}
      />
      <MpSettingsFieldModal
        open={editField === 'gender'}
        title="เพศ"
        label="เพศ"
        value={fieldDraft('gender')}
        type="select"
        options={['ชาย', 'หญิง', 'อื่นๆ', 'ไม่ระบุ']}
        onClose={() => setEditField(null)}
        onSave={(v) => saveField('gender', v)}
      />
      <MpSettingsFieldModal
        open={editField === 'birthday'}
        title="วันเกิด"
        label="วันเกิด"
        value={fieldDraft('birthday')}
        type="date"
        onClose={() => setEditField(null)}
        onSave={(v) => saveField('birthday', v)}
      />
    </div>
  );
}
