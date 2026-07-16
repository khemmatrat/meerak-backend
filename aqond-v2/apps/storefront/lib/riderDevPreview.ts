import type { RiderProfile } from '@/lib/rider';

const SESSION_KEY = 'aqond_rider_os_dev_preview';

/** แสดงปุ่ม dev / preview — localhost หรือ dev build */
export function isRiderDevBuild(): boolean {
  if (process.env.NODE_ENV !== 'production') return true;
  if (typeof window === 'undefined') return false;
  const host = window.location.hostname;
  return host === 'localhost' || host === '127.0.0.1';
}

export function isRiderDevPreview(): boolean {
  if (!isRiderDevBuild()) return false;
  if (typeof window === 'undefined') return false;
  try {
    const params = new URLSearchParams(window.location.search);
    if (params.get('devPreview') === '1') return true;
    return sessionStorage.getItem(SESSION_KEY) === '1';
  } catch {
    return false;
  }
}

export function enableRiderDevPreview(): void {
  if (typeof window === 'undefined') return;
  sessionStorage.setItem(SESSION_KEY, '1');
}

export function disableRiderDevPreview(): void {
  if (typeof window === 'undefined') return;
  sessionStorage.removeItem(SESSION_KEY);
}

export const DEV_PREVIEW_RIDER_ID = 'dev-rider-preview';

export function getDevPreviewProfile(name?: string): RiderProfile {
  return {
    rider_id: DEV_PREVIEW_RIDER_ID,
    display_name: name || 'Dev Rider (Preview)',
    phone: '0800000000',
    vehicle: 'motorcycle',
    plate: 'DEV-001',
    kyc_status: 'approved',
    active: true,
    suspended: false,
    earnings_micro: 125_000_000,
  };
}

/** Mock COD dashboard data when dev preview has no backend rider row. */
export function getDevPreviewCodSummary() {
  return {
    rider_id: DEV_PREVIEW_RIDER_ID,
    outstanding_micro: 350_000,
    limit_micro: 2_000_000,
    available_cod_limit_micro: 1_650_000,
    pending_deposit_micro: 200_000,
    open_holds: [
      {
        id: 'dev-hold-1',
        job_id: 'dev-job-held-001',
        amount_micro: 150_000,
        status: 'held' as const,
      },
      {
        id: 'dev-hold-2',
        job_id: 'dev-job-collected-002',
        amount_micro: 200_000,
        status: 'collected' as const,
      },
    ],
    provisional: true,
  };
}
