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
import { MpSettingsFieldModal, MpSettingsSubHeader } from '@/components/mobile/MpSettingsUi';

const BANKS = [
  { code: 'KTB', name: 'กรุงไทย (KTB)' },
  { code: 'KBANK', name: 'กสิกรไทย (KBANK)' },
  { code: 'SCB', name: 'ไทยพาณิชย์ (SCB)' },
  { code: 'BBL', name: 'กรุงเทพ (BBL)' },
];

export function MpAccountPaymentClient() {
  const { auth, user } = useAuth();
  const params = useSearchParams();
  const embed = params.get('embed') === '1';
  const suffix = embed ? '?embed=1' : '';
  const backHref = embed ? '/m/account/settings?embed=1' : '/m/account/settings';

  const [data, setData] = useState<AccountSettingsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [bankModal, setBankModal] = useState(false);
  const [cardModal, setCardModal] = useState(false);
  const [bankCode, setBankCode] = useState('KTB');
  const [accountSuffix, setAccountSuffix] = useState('');

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

  const addBank = async () => {
    if (!auth?.userId || accountSuffix.length < 4) return;
    const bank = BANKS.find((b) => b.code === bankCode) || BANKS[0];
    const d = await saveAccountSettings(auth.userId, {
      add_bank: {
        bank_code: bank.code,
        bank_name: bank.name,
        account_suffix: accountSuffix.slice(-4),
        verified: true,
        is_default: (data?.bank_accounts.length || 0) === 0,
      },
    });
    setData(d);
    setAccountSuffix('');
    setBankModal(false);
  };

  const addCard = async (last4: string) => {
    if (!auth?.userId || last4.length < 4) return;
    const d = await saveAccountSettings(auth.userId, {
      add_card: { brand: 'Visa', last4: last4.slice(-4) },
    });
    setData(d);
    setCardModal(false);
  };

  if (!auth) {
    return (
      <div className="tt-mp-settings">
        <MpSettingsSubHeader title="บัญชีธนาคาร/ บัตรเครดิต/ บัตรเดบิต" backHref={backHref} />
        <p className="tt-hint" style={{ padding: 24, textAlign: 'center' }}>
          <Link href={`/m/login${suffix}`}>เข้าสู่ระบบ</Link>
        </p>
      </div>
    );
  }

  return (
    <div className="tt-mp-settings tt-mp-payment-page">
      <MpSettingsSubHeader title="บัญชีธนาคาร/ บัตรเครดิต/ บัตรเดบิต" backHref={backHref} />

      {loading && <p className="tt-loading">กำลังโหลด...</p>}

      {!loading && data && (
        <div className="tt-mp-settings-body">
          <section className="tt-mp-settings-section">
            <h2>
              บัตรเครดิต/บัตรเดบิต <span className="tt-mp-settings-help">?</span>
            </h2>
            <div className="tt-mp-settings-card">
              {data.cards.map((c) => (
                <div key={c.id} className="tt-mp-payment-row">
                  <span className="tt-mp-payment-icon">💳</span>
                  <span>
                    {c.brand} •••• {c.last4}
                  </span>
                </div>
              ))}
              <button type="button" className="tt-mp-payment-add" onClick={() => setCardModal(true)}>
                <span>+</span> เพิ่มบัตรใหม่
              </button>
            </div>
          </section>

          <section className="tt-mp-settings-section">
            <h2>
              Credit Card Points <span className="tt-mp-settings-help">?</span>
            </h2>
            <div className="tt-mp-settings-card">
              {data.point_cards.map((c) => (
                <div key={c.id} className="tt-mp-payment-row">
                  <span className="tt-mp-payment-icon">⭐</span>
                  <span>
                    {c.brand} •••• {c.last4}
                  </span>
                </div>
              ))}
              <button type="button" className="tt-mp-payment-add" onClick={() => setCardModal(true)}>
                <span>+</span> ผูกบัตรเครดิตใหม่
              </button>
            </div>
          </section>

          <section className="tt-mp-settings-section">
            <h2>
              บัญชีธนาคาร <span className="tt-mp-settings-help">?</span>
            </h2>
            <div className="tt-mp-settings-card">
              {data.bank_accounts.map((b) => (
                <div key={b.id} className="tt-mp-payment-bank-row">
                  <span className="tt-mp-payment-bank-icon">🏦</span>
                  <div className="tt-mp-payment-bank-meta">
                    <strong>{b.bank_name}</strong>
                    <span>*{b.account_suffix}</span>
                    <div className="tt-mp-payment-badges">
                      {b.verified && <em>ตรวจสอบแล้ว</em>}
                      {b.is_default && <em>ค่าเริ่มต้น</em>}
                    </div>
                  </div>
                  <span className="tt-mp-settings-chevron">›</span>
                </div>
              ))}
              <button type="button" className="tt-mp-payment-add dashed" onClick={() => setBankModal(true)}>
                <span>+</span> เพิ่มบัญชีธนาคาร
              </button>
            </div>
          </section>

          <section className="tt-mp-settings-section">
            <h2>ตั้งค่าการชำระเงินอัตโนมัติ</h2>
            <button
              type="button"
              className="tt-mp-settings-card tt-mp-payment-auto"
              onClick={() =>
                auth?.userId &&
                void saveAccountSettings(auth.userId, { auto_pay_enabled: !data.auto_pay_enabled }).then(setData)
              }
            >
              <span className="tt-mp-payment-icon">🧡</span>
              <span>ตั้งค่าการชำระเงินอัตโนมัติ</span>
              <span className={`tt-mp-settings-switch${data.auto_pay_enabled ? ' on' : ''}`} />
            </button>
          </section>
        </div>
      )}

      {bankModal && (
        <div className="tt-mp-settings-modal-backdrop" onClick={() => setBankModal(false)}>
          <div className="tt-mp-settings-modal" onClick={(e) => e.stopPropagation()}>
            <h3>เพิ่มบัญชีธนาคาร</h3>
            <label className="tt-mp-settings-modal-label">ธนาคาร</label>
            <select
              className="tt-mp-settings-modal-input"
              value={bankCode}
              onChange={(e) => setBankCode(e.target.value)}
            >
              {BANKS.map((b) => (
                <option key={b.code} value={b.code}>
                  {b.name}
                </option>
              ))}
            </select>
            <label className="tt-mp-settings-modal-label">เลขบัญชี (4 หลักท้าย)</label>
            <input
              className="tt-mp-settings-modal-input"
              value={accountSuffix}
              onChange={(e) => setAccountSuffix(e.target.value.replace(/\D/g, '').slice(0, 4))}
              placeholder="4819"
              inputMode="numeric"
            />
            <div className="tt-mp-settings-modal-actions">
              <button type="button" onClick={() => setBankModal(false)}>
                ยกเลิก
              </button>
              <button type="button" className="primary" onClick={() => void addBank()}>
                บันทึก
              </button>
            </div>
          </div>
        </div>
      )}

      <MpSettingsFieldModal
        open={cardModal}
        title="เพิ่มบัตร"
        label="เลขบัตร 4 หลักท้าย"
        value=""
        onClose={() => setCardModal(false)}
        onSave={addCard}
      />
    </div>
  );
}
