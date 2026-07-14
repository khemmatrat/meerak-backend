'use client';

import { Suspense } from 'react';
import { MatchJobsListView } from '@/components/services/match/MatchJobsListView';
import { AxsServicesLoading } from '@/components/axs/services/AxsServicesLoading';

export default function ServicesMatchPage() {
  return (
    <Suspense fallback={<AxsServicesLoading label="กำลังโหลด Match Job..." />}>
      <MatchJobsListView />
    </Suspense>
  );
}
