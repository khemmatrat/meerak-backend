'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { createTalentAiAdapter, type TalentAiAdapter } from '@/lib/talent/ai/talentAiAdapter';
import { createTalentAiMockProvider } from '@/lib/talent/ai/talentAiMockProvider';
import type { TalentAiHistoryEntry } from '@/lib/talent/talentAiTypes';

type TalentAiContextValue = {
  adapter: TalentAiAdapter;
  providerId: 'mock';
  history: TalentAiHistoryEntry[];
  historyLoading: boolean;
  refreshHistory: () => Promise<void>;
  lastError: string | null;
  clearError: () => void;
};

const TalentAiContext = createContext<TalentAiContextValue | null>(null);

export function TalentAiProvider({ children }: { children: ReactNode }) {
  const adapter = useMemo(() => createTalentAiAdapter(createTalentAiMockProvider(), 'mock'), []);
  const [history, setHistory] = useState<TalentAiHistoryEntry[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [lastError, setLastError] = useState<string | null>(null);

  const refreshHistory = useCallback(async () => {
    setHistoryLoading(true);
    setLastError(null);
    try {
      const rows = await adapter.listHistory();
      setHistory(rows);
    } catch (e) {
      setLastError(e instanceof Error ? e.message : 'history_unavailable');
      setHistory([]);
    } finally {
      setHistoryLoading(false);
    }
  }, [adapter]);

  useEffect(() => {
    void refreshHistory();
  }, [refreshHistory]);

  const clearError = useCallback(() => setLastError(null), []);

  const value = useMemo(
    () => ({
      adapter,
      providerId: 'mock' as const,
      history,
      historyLoading,
      refreshHistory,
      lastError,
      clearError,
    }),
    [adapter, history, historyLoading, refreshHistory, lastError, clearError],
  );

  return <TalentAiContext.Provider value={value}>{children}</TalentAiContext.Provider>;
}

export function useTalentAi() {
  const ctx = useContext(TalentAiContext);
  if (!ctx) throw new Error('useTalentAi outside TalentAiProvider');
  return ctx;
}
