'use client';

import Link from 'next/link';
import { StatusChip } from '@aqond/ui';
import type { RiderAvailability } from '@/lib/rider';
import type { RiderAcceptStatus } from '@/lib/riderOperateStatus';
import { riderOsPath } from '@/lib/riderOsPaths';

const SEGMENTS: { id: RiderAvailability; label: string }[] = [
  { id: 'offline', label: 'ออฟไลน์' },
  { id: 'break', label: 'พัก' },
  { id: 'online', label: 'ออนไลน์' },
];

type Props = {
  riderId?: string;
  canOperate: boolean;
  availability: RiderAvailability;
  busy?: boolean;
  acceptStatus: RiderAcceptStatus;
  gpsChipLabel?: string | null;
  gpsReady?: boolean;
  onChange: (next: RiderAvailability) => void;
  compact?: boolean;
};

export function RiderAvailabilityControl({
  riderId,
  canOperate,
  availability,
  busy,
  acceptStatus,
  gpsChipLabel,
  gpsReady,
  onChange,
  compact,
}: Props) {
  const disabled = !canOperate || busy || !riderId;

  return (
    <div className={`tt-rider-avail-wrap${compact ? ' compact' : ''}`}>
      <div className="tt-rider-avail-segments" role="group" aria-label="สถานะรับงาน">
        {SEGMENTS.map((seg) => (
          <button
            key={seg.id}
            type="button"
            className={`tt-rider-avail-seg${availability === seg.id ? ' active' : ''}${seg.id === 'online' ? ' online' : ''}${seg.id === 'break' ? ' break' : ''}`}
            disabled={disabled}
            onClick={() => onChange(seg.id)}
          >
            {seg.id === 'online' && <span className="tt-rider-online-dot" />}
            {seg.label}
          </button>
        ))}
      </div>
      <div className="tt-rider-avail-chips axs-rider-status-row">
        <StatusChip
          tone={
            acceptStatus.statusTone === 'ready'
              ? 'online'
              : acceptStatus.statusTone === 'offline'
                ? 'offline'
                : acceptStatus.statusTone === 'warn'
                  ? 'pending'
                  : 'offline'
          }
          live={acceptStatus.canAcceptJobs}
        >
          {acceptStatus.statusLabel}
        </StatusChip>
        {gpsChipLabel && (
          <StatusChip tone={gpsReady ? 'online' : 'offline'} live={gpsReady}>
            {gpsChipLabel}
          </StatusChip>
        )}
      </div>
      {acceptStatus.blockers.length > 0 && (
        <ul className={`tt-rider-blockers${compact ? ' compact' : ''}`}>
          {acceptStatus.blockers.map((b) => (
            <li key={b.id} className={`tt-rider-blocker tt-rider-blocker--${b.severity}`}>
              <span className="tt-rider-blocker-title">{b.title}</span>
              {b.detail && <span className="tt-rider-blocker-detail">{b.detail}</span>}
              {b.fixHref && (
                <Link
                  href={b.fixHref.startsWith('/m') ? b.fixHref : riderOsPath(b.fixHref)}
                  className="tt-rider-blocker-fix"
                >
                  แก้ไข →
                </Link>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
