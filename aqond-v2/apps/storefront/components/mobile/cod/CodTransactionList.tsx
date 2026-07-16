'use client';

import Link from 'next/link';
import { formatDate } from '@/lib/format';
import { formatCodThb, type RiderCodHold } from '@/lib/riderCod';
import { riderOsPath } from '@/lib/riderOsPaths';

type Props = {
  holds: RiderCodHold[];
  limit?: number;
  emptyLabel?: string;
};

function statusMeta(status: RiderCodHold['status']) {
  switch (status) {
    case 'held':
      return { label: 'รอเก็บ', tone: 'pending', icon: '🟡' };
    case 'collected':
      return { label: 'รอฝาก', tone: 'collected', icon: '🟢' };
    case 'deposited':
      return { label: 'ฝากแล้ว', tone: 'done', icon: '✅' };
    default:
      return { label: status, tone: 'pending', icon: '·' };
  }
}

export function CodTransactionList({ holds, limit, emptyLabel }: Props) {
  const rows = limit ? holds.slice(0, limit) : holds;

  if (rows.length === 0) {
    return (
      <div className="tt-rider-cod-empty">
        <span className="tt-rider-cod-empty-icon" aria-hidden>
          📭
        </span>
        <p>{emptyLabel || 'ยังไม่มีรายการ COD'}</p>
      </div>
    );
  }

  return (
    <ul className="tt-rider-cod-txn-list">
      {rows.map((h) => {
        const meta = statusMeta(h.status);
        const href =
          h.status === 'held'
            ? riderOsPath(`/active/${h.job_id}`)
            : riderOsPath('/cod/history');
        return (
          <li key={h.id || h.job_id}>
            <Link href={href} className="tt-rider-cod-txn">
              <div className="tt-rider-cod-txn-main">
                <strong>
                  {meta.icon} #{h.job_id.slice(-8)}
                </strong>
                <span className={`tt-rider-cod-badge tt-rider-cod-badge--${meta.tone}`}>
                  {meta.label}
                </span>
              </div>
              <div className="tt-rider-cod-txn-sub">
                <span>฿ {formatCodThb(h.amount_micro)}</span>
                {h.collected_at && (
                  <span className="tt-rider-cod-txn-when">
                    เก็บ {formatDate(h.collected_at)}
                  </span>
                )}
              </div>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
