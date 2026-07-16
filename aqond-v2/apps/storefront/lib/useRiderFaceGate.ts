'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  fetchRiderFaceSession,
  loadRiderFaceSessionToken,
  type RiderFaceSessionStatus,
  type RiderFaceVerifyPurpose,
} from '@/lib/riderFaceSession';

function resolveVerifyPurpose(status: RiderFaceSessionStatus | null): RiderFaceVerifyPurpose {
  if (!status) return 'daily';
  if (status.strict_due || status.reverify_due) return 'strict';
  if (!status.daily_active && !(status.online_active && loadRiderFaceSessionToken())) {
    return 'daily';
  }
  return 'daily';
}

export function useRiderFaceGate(riderId?: string, authToken?: string) {
  const [status, setStatus] = useState<RiderFaceSessionStatus | null>(null);
  const [verifyOpen, setVerifyOpen] = useState(false);
  const [verifyPurpose, setVerifyPurpose] = useState<RiderFaceVerifyPurpose>('daily');

  const reload = useCallback(async () => {
    if (!riderId) return;
    const s = await fetchRiderFaceSession(riderId, authToken);
    setStatus(s);
  }, [authToken, riderId]);

  useEffect(() => {
    void reload();
    const t = setInterval(() => void reload(), 60_000);
    return () => clearInterval(t);
  }, [reload]);

  const needsDailyVerify = !!status && !status.daily_active;
  const needsStrictVerify = !!status?.strict_due || !!status?.reverify_due;
  const needsPassengerVerify = !!status && !status.passenger_active;

  const openVerify = (purpose: RiderFaceVerifyPurpose) => {
    setVerifyPurpose(purpose === 'online' ? 'daily' : purpose === 'reverify' ? 'strict' : purpose);
    setVerifyOpen(true);
  };

  const closeVerify = () => setVerifyOpen(false);

  const onVerified = (_token: string) => {
    setVerifyOpen(false);
    void reload();
  };

  const ensureOnline = (): boolean => {
    if (!status) return true;
    if (status.strict_due || status.reverify_due) {
      openVerify('strict');
      return false;
    }
    if (!status.daily_active && !loadRiderFaceSessionToken()) {
      openVerify('daily');
      return false;
    }
    return true;
  };

  const ensureForJob = (job: {
    job_type?: string;
    payment_method?: string;
    amount_micro?: number;
  }): boolean => {
    if (!status) return true;
    const jt = String(job.job_type || '').toLowerCase();
    const pm = String(job.payment_method || '').toLowerCase();
    const amt = Number(job.amount_micro || 0);
    const isPassenger = jt === 'passenger';
    const isHighCod = (pm === 'cod' || !pm) && amt >= (status.high_cod_micro || 1_000_000);

    if (status.strict_due || status.reverify_due) {
      openVerify('strict');
      return false;
    }
    if (!status.daily_active && !loadRiderFaceSessionToken()) {
      openVerify('daily');
      return false;
    }
    if (isPassenger && !status.passenger_active) {
      openVerify('passenger');
      return false;
    }
    if (isHighCod && !loadRiderFaceSessionToken()) {
      openVerify('daily');
      return false;
    }
    return true;
  };

  return {
    status,
    reload,
    verifyOpen,
    verifyPurpose: verifyOpen ? verifyPurpose : resolveVerifyPurpose(status),
    openVerify,
    closeVerify,
    onVerified,
    ensureOnline,
    ensureForJob,
    needsDailyVerify,
    needsStrictVerify,
    needsPassengerVerify,
    /** @deprecated */ needsOnlineVerify: needsDailyVerify,
    /** @deprecated */ needsReverify: needsStrictVerify,
  };
}
