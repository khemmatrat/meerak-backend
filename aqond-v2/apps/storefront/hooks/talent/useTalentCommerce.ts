'use client';

import { useMemo, useState } from 'react';
import { useTalentRawData } from '@/hooks/talent/useTalentRawData';
import { composeTalentCommerce } from '@/lib/talent/commerce/talentCommerceCompose';
import type { TalentCommercePeriodId } from '@/lib/talent/commerce/talentCommerceTypes';

export function useTalentCommerce() {
  const { raw, loading, error, userId, loggedIn, reload } = useTalentRawData('commerce');
  const [period, setPeriod] = useState<TalentCommercePeriodId>('week');

  const composed = useMemo(
    () => (raw && userId ? composeTalentCommerce(raw, userId, period) : null),
    [raw, userId, period],
  );

  return {
    loading,
    error,
    period,
    setPeriod,
    composed,
    loggedIn,
    reload,
  };
}
