import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import {
  getFinanceRuntimeConfig,
  patchFinanceRuntimeConfig,
  type FinanceRuntimeConfig,
} from "../services/adminApi";

type FinanceRuntimeContextValue = {
  config: FinanceRuntimeConfig | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  patch: (partial: Parameters<typeof patchFinanceRuntimeConfig>[0]) => Promise<FinanceRuntimeConfig | void>;
};

const FinanceRuntimeContext = createContext<FinanceRuntimeContextValue | null>(null);

export function FinanceRuntimeProvider({ children }: { children: React.ReactNode }) {
  const [config, setConfig] = useState<FinanceRuntimeConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const c = await getFinanceRuntimeConfig();
      setConfig(c);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
      setConfig(null);
    } finally {
      setLoading(false);
    }
  }, []);

  const patch = useCallback(async (partial: Parameters<typeof patchFinanceRuntimeConfig>[0]) => {
    try {
      const next = await patchFinanceRuntimeConfig(partial);
      setConfig(next);
      return next;
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
      throw e;
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const value = useMemo(
    () => ({ config, loading, error, refresh, patch }),
    [config, loading, error, refresh, patch]
  );

  return <FinanceRuntimeContext.Provider value={value}>{children}</FinanceRuntimeContext.Provider>;
}

export function useFinanceRuntime(): FinanceRuntimeContextValue {
  const ctx = useContext(FinanceRuntimeContext);
  if (!ctx) {
    throw new Error("useFinanceRuntime must be used within FinanceRuntimeProvider");
  }
  return ctx;
}
