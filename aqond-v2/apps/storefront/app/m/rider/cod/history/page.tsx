'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/lib/auth';
import { useRider } from '@/components/mobile/RiderShell';
import { riderOsPath } from '@/lib/riderOsPaths';
import {
  emptyRiderCodSummary,
  fetchRiderCodSummary,
  type RiderCodSummary,
} from '@/lib/riderCod';
import { getDevPreviewCodSummary } from '@/lib/riderDevPreview';
import { CodDashboardSkeleton } from '@/components/mobile/cod/CodDashboardSkeleton';
import { CodTransactionList } from '@/components/mobile/cod/CodTransactionList';

export default function RiderCodHistoryPage() {
  const { auth } = useAuth();
  const { riderId, devPreview } = useRider();
  const [summary, setSummary] = useState<RiderCodSummary | null>(null);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    if (!riderId) {
      setLoading(false);
      return;
    }
    try {
      if (devPreview) {
        setSummary(getDevPreviewCodSummary());
      } else if (auth?.userId) {
        setSummary(await fetchRiderCodSummary(auth));
      } else {
        setSummary(null);
      }
    } catch {
      setSummary(emptyRiderCodSummary(riderId));
    } finally {
      setLoading(false);
    }
  }, [riderId, auth, devPreview]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return (
    <div className="tt-rider-cod-page">
      <header className="tt-rider-cod-top">
        <div>
          <Link href={riderOsPath('/cod')} className="tt-rider-cod-back">
            ← COD
          </Link>
          <h1>ประวัติ COD</h1>
        </div>
      </header>

      {loading ? (
        <CodDashboardSkeleton />
      ) : (
        <CodTransactionList
          holds={summary?.open_holds || []}
          emptyLabel="ยังไม่มีประวัติ COD"
        />
      )}
    </div>
  );
}
