'use client';

type Props = {
  variant?: 'compact' | 'full';
  className?: string;
};

export function WalletTrustBadge({ variant = 'compact', className = '' }: Props) {
  if (variant === 'full') {
    return (
      <div className={`tt-wallet-trust tt-wallet-trust-full ${className}`.trim()}>
        <span className="tt-wallet-trust-icon" aria-hidden>
          🛡️
        </span>
        <div>
          <strong>กระเป๋า AQOND ปิดวง — ปลอดภัย</strong>
          <p>
            เงินฝากและจ่ายผ่านระบบในแอปเท่านั้น ไม่โอนนอกแพลตฟอร์ม ไม่มีลิงก์ชำระเงินปลอม
            โบนัสชวนเพื่อนนับเมื่อเพื่อนเปิด Wallet จริง
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className={`tt-wallet-trust ${className}`.trim()} role="note">
      <span aria-hidden>🛡️</span>
      <span>
        <strong>ปลอดภัย:</strong> Wallet ปิดวงใน AQOND — ไม่โอนนอกแอป · โบนัสนับเมื่อเพื่อนเปิด Wallet
      </span>
    </div>
  );
}
