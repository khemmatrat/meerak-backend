'use client';

import { useEffect, useState } from 'react';
import { formatCodThb } from '@/lib/riderCod';

export type CodDepositMethod = 'bank_transfer' | 'counter' | 'hub' | 'wallet';

type Props = {
  open: boolean;
  pendingMicro: number;
  jobIds: string[];
  busy?: boolean;
  walletBalanceMicro?: number | null;
  onClose: () => void;
  onConfirm: (method: CodDepositMethod, jobIds: string[]) => Promise<void>;
};

const BANK = {
  name: 'ธนาคารกสิกรไทย',
  account: 'XXX-X-XXXXX-X',
  holder: 'บจก. AQOND Rider OS',
};

type Step = 'select' | 'bank' | 'success';

export function CodDepositModal({
  open,
  pendingMicro,
  jobIds,
  busy,
  walletBalanceMicro,
  onClose,
  onConfirm,
}: Props) {
  const [step, setStep] = useState<Step>('select');
  const [method, setMethod] = useState<CodDepositMethod>('bank_transfer');

  useEffect(() => {
    if (!open) {
      setStep('select');
      setMethod('bank_transfer');
    }
  }, [open]);

  if (!open) return null;

  const pendingLabel = `฿ ${formatCodThb(pendingMicro)}`;
  const refCode = `COD-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}`;

  const runDeposit = async (m: CodDepositMethod) => {
    if (!jobIds.length) return;
    await onConfirm(m, jobIds);
    setStep('success');
  };

  return (
    <div className="tt-rider-cod-modal-backdrop" onClick={onClose} role="presentation">
      <div
        className="tt-rider-cod-modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="ฝากเงิน COD"
      >
        {step === 'select' && (
          <>
            <header className="tt-rider-cod-modal-head">
              <h3>เลือกวิธีฝากเงิน</h3>
              <p>
                เงินที่ต้องฝาก <strong>{pendingLabel}</strong> · {jobIds.length} รายการ
              </p>
            </header>

            <div className="tt-rider-cod-deposit-options">
              <button
                type="button"
                className="tt-rider-cod-deposit-opt"
                disabled={busy || !jobIds.length}
                onClick={() => {
                  setMethod('bank_transfer');
                  setStep('bank');
                }}
              >
                <span className="tt-rider-cod-deposit-opt-icon">🏦</span>
                <div>
                  <strong>โอนผ่านธนาคาร</strong>
                  <p>รวดเร็ว · ไม่มีค่าธรรมเนียม</p>
                </div>
              </button>

              <button
                type="button"
                className="tt-rider-cod-deposit-opt"
                disabled={busy || !jobIds.length}
                onClick={() => void runDeposit('counter')}
              >
                <span className="tt-rider-cod-deposit-opt-icon">🏪</span>
                <div>
                  <strong>Counter Service</strong>
                  <p>7-Eleven / Tesco · ค่าธรรมเนียม ~฿15</p>
                </div>
              </button>

              <button
                type="button"
                className="tt-rider-cod-deposit-opt"
                disabled={busy || !jobIds.length}
                onClick={() => void runDeposit('hub')}
              >
                <span className="tt-rider-cod-deposit-opt-icon">📍</span>
                <div>
                  <strong>ฝากที่ Hub</strong>
                  <p>จุดรับฝากพาร์ทเนอร์ (provisional)</p>
                </div>
              </button>

              <button
                type="button"
                className="tt-rider-cod-deposit-opt"
                disabled={busy || !jobIds.length}
                onClick={() => void runDeposit('wallet')}
              >
                <span className="tt-rider-cod-deposit-opt-icon">💳</span>
                <div>
                  <strong>หักจาก Wallet</strong>
                  <p>
                    หักทันที
                    {walletBalanceMicro != null && (
                      <> · คงเหลือ ฿ {formatCodThb(walletBalanceMicro)}</>
                    )}
                  </p>
                </div>
              </button>
            </div>

            <button type="button" className="tt-rider-cod-modal-close" onClick={onClose}>
              ปิด
            </button>
          </>
        )}

        {step === 'bank' && (
          <>
            <header className="tt-rider-cod-modal-head">
              <h3>โอนเงินผ่านธนาคาร</h3>
              <p className="tt-rider-cod-modal-warn">โอนให้ตรงจำนวนและใส่หมายเหตุตามด้านล่าง</p>
            </header>

            <dl className="tt-rider-cod-bank-card">
              <div>
                <dt>ธนาคาร</dt>
                <dd>{BANK.name}</dd>
              </div>
              <div>
                <dt>เลขบัญชี</dt>
                <dd className="tt-rider-cod-mono">
                  {BANK.account}
                  <button
                    type="button"
                    className="tt-rider-cod-copy"
                    onClick={() => void navigator.clipboard?.writeText(BANK.account)}
                  >
                    คัดลอก
                  </button>
                </dd>
              </div>
              <div>
                <dt>ชื่อบัญชี</dt>
                <dd>{BANK.holder}</dd>
              </div>
              <div>
                <dt>จำนวน</dt>
                <dd className="tt-rider-cod-bank-amt">{pendingLabel}</dd>
              </div>
              <div>
                <dt>หมายเหตุ</dt>
                <dd className="tt-rider-cod-mono">{refCode}</dd>
              </div>
            </dl>

            <div className="tt-rider-cod-modal-actions">
              <button type="button" className="tt-rider-cod-btn-secondary" onClick={() => setStep('select')}>
                ย้อนกลับ
              </button>
              <button
                type="button"
                className="tt-rider-cod-btn-primary"
                disabled={busy}
                onClick={() => void runDeposit(method)}
              >
                {busy ? 'กำลังบันทึก…' : 'ยืนยันฝากแล้ว'}
              </button>
            </div>
          </>
        )}

        {step === 'success' && (
          <div className="tt-rider-cod-success">
            <span className="tt-rider-cod-success-icon" aria-hidden>
              ✅
            </span>
            <h3>บันทึกการฝากแล้ว</h3>
            <p>ระบบจะกระทบยอดภายใน 15 นาที (provisional reconciliation)</p>
            <button type="button" className="tt-rider-cod-btn-primary" onClick={onClose}>
              ปิด
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
