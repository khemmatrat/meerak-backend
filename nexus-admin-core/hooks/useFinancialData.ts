/**
 * Hooks for financial data — ใช้ดึงข้อมูลการเงินและ refresh
 */
import { useState, useEffect, useCallback } from "react";
import {
  getJobGuarantees,
  getCommissionData,
  getRealTimeExpenses,
  getMarketCapData,
  type JobGuaranteesResponse,
  type CommissionData,
  type ExpenseItem,
  type MarketCapData,
} from "../services/financialService";

const POLL_INTERVAL_MS = 60 * 1000;

export function useJobGuarantees() {
  const [data, setData] = useState<JobGuaranteesResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await getJobGuarantees();
      setData(res);
    } catch (e: any) {
      setError(e?.message || String(e));
      setData(null);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return { data, loading, error, refetch: fetchData };
}

export function useCommissionRevenue() {
  const [data, setData] = useState<CommissionData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await getCommissionData();
      setData(res);
    } catch (e: any) {
      setError(e?.message || String(e));
      setData(null);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return { data, loading, error, refetch: fetchData };
}

export function useRealTimeExpenses(pollInterval = POLL_INTERVAL_MS) {
  const [expenses, setExpenses] = useState<ExpenseItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await getRealTimeExpenses();
      setExpenses(res);
    } catch (e: any) {
      setError(e?.message || String(e));
      setExpenses([]);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchData();
    const t = setInterval(fetchData, pollInterval);
    return () => clearInterval(t);
  }, [fetchData, pollInterval]);

  return { expenses, loading, error, refetch: fetchData };
}

export function useMarketCap() {
  const [data, setData] = useState<MarketCapData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await getMarketCapData();
      setData(res);
    } catch (e: any) {
      setError(e?.message || String(e));
      setData(null);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return { data, loading, error, refetch: fetchData };
}
