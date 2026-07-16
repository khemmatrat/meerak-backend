'use client';

import Link from 'next/link';
import { formatCatalogPrice } from '@/lib/format';
import {
  computeCreditRemainingPct,
  CREDIT_LOW_THRESHOLD_PCT,
  isCreditLow,
} from '@/lib/riderCreditLedger';
import { riderOsPath } from '@/lib/riderOsPaths';

type Props = {
  availableMicro: number;
  limitMicro: number;
  className?: string;
  compact?: boolean;
};

export function RiderCreditLowBanner({ availableMicro, limitMicro, className, compact }: Props) {
  if (!isCreditLow(availableMicro, limitMicro)) return null;

  const pct = computeCreditRemainingPct(availableMicro, limitMicro);

  return (
    <div className={`tt-rider-credit-low${compact ? ' compact' : ''}${className ? ` ${className}` : ''}`}>
      <div className="tt-rider-credit-low-copy">
        <strong>เครดิตใกล้หมด — เหลือ {pct}%</strong>
        <p>
          คงเหลือ {formatCatalogPrice(availableMicro)} จากวงเงิน {formatCatalogPrice(limitMicro)}
          {' '}(ต่ำกว่า {CREDIT_LOW_THRESHOLD_PCT}%)
        </p>
      </div>
      <Link href={riderOsPath('/wallet')} className="tt-rider-credit-low-cta">
        เติมเครดิต →
      </Link>
    </div>
  );
}
