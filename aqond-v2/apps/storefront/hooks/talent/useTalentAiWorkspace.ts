'use client';

import { useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { TALENT_AI_PANELS, type TalentAiPanelId } from '@/lib/talent/talentAiTypes';

const VALID: TalentAiPanelId[] = ['resume', 'jobs', 'incubation', 'history', 'composer'];

export function useTalentAiWorkspace() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const tabParam = searchParams.get('tab') as TalentAiPanelId | null;
  const activePanel: TalentAiPanelId =
    tabParam && VALID.includes(tabParam) ? tabParam : 'resume';

  const setActivePanel = useCallback(
    (panel: TalentAiPanelId) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set('tab', panel);
      router.replace(`/m/talent/ai?${params.toString()}`, { scroll: false });
    },
    [router, searchParams],
  );

  return { activePanel, setActivePanel, panels: TALENT_AI_PANELS };
}
