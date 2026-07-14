import React, { useState, useEffect } from 'react';
import { Users, TrendingUp, Gift, AlertTriangle, RefreshCw, Loader2, Wallet, Settings, ShieldAlert, Banknote } from 'lucide-react';

interface LeaderboardEntry {
  userId: string;
  fullName: string;
  referralCode: string;
  referralCount: number;
  earnedThisWeek: number;
}

interface BudgetInfo {
  id: string;
  campaignName: string;
  totalAllocated: number;
  totalSpent: number;
  availableBalance: number;
  commissionRatePct: number;
  isActive: boolean;
}

interface MonitorData {
  leaderboard: LeaderboardEntry[];
  totalReferrers: number;
  totalReferrals: number;
  totalPaid: number;
  suspiciousInactive: Array<{ referrerId: string; inactiveCount: number }>;
  budget: BudgetInfo | null;
  pendingPayoutCount: number;
  fraudSameBank: Array<{ referrerId: string; refereeId: string }>;
  fraudSameIp: Array<{ referrerId: string; refereeId: string }>;
}

const API_BASE = (import.meta as any).env?.VITE_ADMIN_API_URL || 'http://localhost:3001';

function getAuthHeaders(): Record<string, string> {
  const token = localStorage.getItem('nexus_admin_token');
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function fetchMonitor(): Promise<MonitorData> {
  const res = await fetch(`${API_BASE}/api/admin/referral/monitor?limit=20`, {
    headers: { ...getAuthHeaders() },
  });
  if (!res.ok) throw new Error('Failed to fetch');
  return res.json();
}

async function postTopUp(amount: number, note?: string): Promise<void> {
  const res = await fetch(`${API_BASE}/api/admin/referral/top-up`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
    body: JSON.stringify({ amount, note }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || res.statusText);
  }
}

async function putCampaign(isActive?: boolean, commissionRatePct?: number): Promise<void> {
  const res = await fetch(`${API_BASE}/api/admin/referral/campaign`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
    body: JSON.stringify({ is_active: isActive, commission_rate_pct: commissionRatePct }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || res.statusText);
  }
}

async function postProcessPending(): Promise<{ processed: number }> {
  const res = await fetch(`${API_BASE}/api/admin/referral/process-pending`, {
    method: 'POST',
    headers: getAuthHeaders(),
  });
  if (!res.ok) throw new Error('Failed to process');
  return res.json();
}

export const ReferralMonitorView: React.FC = () => {
  const [data, setData] = useState<MonitorData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [topUpAmount, setTopUpAmount] = useState('');
  const [topUpNote, setTopUpNote] = useState('');
  const [topUpLoading, setTopUpLoading] = useState(false);
  const [rateInput, setRateInput] = useState('');
  const [campaignLoading, setCampaignLoading] = useState(false);
  const [processLoading, setProcessLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const d = await fetchMonitor();
      setData(d);
      if (d.budget && !rateInput) setRateInput(String(d.budget.commissionRatePct));
    } catch (e: any) {
      setError(e?.message || 'Failed to load');
      setData(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    if (data?.budget && !rateInput) setRateInput(String(data.budget.commissionRatePct));
  }, [data?.budget?.commissionRatePct]);

  const handleTopUp = async () => {
    const amt = parseFloat(topUpAmount);
    if (!(amt > 0)) return;
    setTopUpLoading(true);
    try {
      await postTopUp(amt, topUpNote || undefined);
      setTopUpAmount('');
      setTopUpNote('');
      await load();
    } catch (e: any) {
      setError(e?.message || 'Top-up failed');
    } finally {
      setTopUpLoading(false);
    }
  };

  const handleToggleCampaign = async () => {
    if (!data?.budget) return;
    setCampaignLoading(true);
    try {
      await putCampaign(!data.budget.isActive);
      await load();
    } catch (e: any) {
      setError(e?.message || 'Update failed');
    } finally {
      setCampaignLoading(false);
    }
  };

  const handleUpdateRate = async () => {
    const rate = parseFloat(rateInput);
    if (isNaN(rate) || rate < 0 || rate > 100) return;
    setCampaignLoading(true);
    try {
      await putCampaign(undefined, rate);
      await load();
    } catch (e: any) {
      setError(e?.message || 'Update failed');
    } finally {
      setCampaignLoading(false);
    }
  };

  const handleProcessPending = async () => {
    setProcessLoading(true);
    try {
      const r = await postProcessPending();
      if (r.processed > 0) await load();
    } catch (e: any) {
      setError(e?.message || 'Process failed');
    } finally {
      setProcessLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-[300px]">
        <Loader2 size={32} className="animate-spin text-indigo-500" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <p className="text-rose-600">{error}</p>
        <button onClick={load} className="mt-4 px-4 py-2 bg-slate-200 rounded-lg text-sm">Retry</button>
      </div>
    );
  }

  const budget = data?.budget;
  const totalAllocated = budget?.totalAllocated ?? 0;
  const available = budget?.availableBalance ?? 0;
  const spent = budget?.totalSpent ?? 0;
  const progressPct = totalAllocated > 0 ? Math.min(100, (spent / totalAllocated) * 100) : 0;

  return (
    <div className="p-6 space-y-8">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
          <Gift size={28} className="text-amber-500" />
          Referral Control Center
        </h1>
        <button onClick={load} className="p-2 rounded-lg hover:bg-slate-100">
          <RefreshCw size={18} />
        </button>
      </div>

      {/* Budget Dashboard */}
      {budget && (
        <div className="bg-white rounded-xl border border-slate-100 p-6 shadow-sm space-y-4">
          <h2 className="font-bold text-slate-800 flex items-center gap-2">
            <Wallet size={20} className="text-indigo-500" />
            Budget Tank (ถังงบ)
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <p className="text-sm text-slate-500">Total Allocated</p>
              <p className="text-xl font-bold text-slate-800">฿{totalAllocated.toLocaleString()}</p>
            </div>
            <div>
              <p className="text-sm text-slate-500">Total Spent</p>
              <p className="text-xl font-bold text-amber-700">฿{spent.toLocaleString()}</p>
            </div>
            <div>
              <p className="text-sm text-slate-500">Remaining</p>
              <p className={`text-xl font-bold ${available <= 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
                ฿{available.toLocaleString()}
              </p>
            </div>
          </div>
          <div>
            <div className="flex justify-between text-sm text-slate-500 mb-1">
              <span>Budget used</span>
              <span>{progressPct.toFixed(0)}%</span>
            </div>
            <div className="h-3 bg-slate-100 rounded-full overflow-hidden">
              <div
                className={`h-full ${progressPct >= 90 ? 'bg-rose-500' : progressPct >= 70 ? 'bg-amber-500' : 'bg-emerald-500'}`}
                style={{ width: `${Math.min(100, progressPct)}%` }}
              />
            </div>
          </div>
          <div className="flex flex-wrap gap-4 items-end">
            <div>
              <label className="block text-sm text-slate-600 mb-1">Top-up amount (฿)</label>
              <input
                type="number"
                min="1"
                step="100"
                value={topUpAmount}
                onChange={(e) => setTopUpAmount(e.target.value)}
                className="border border-slate-200 rounded-lg px-3 py-2 w-32"
                placeholder="1000"
              />
            </div>
            <div>
              <label className="block text-sm text-slate-600 mb-1">Note (optional)</label>
              <input
                type="text"
                value={topUpNote}
                onChange={(e) => setTopUpNote(e.target.value)}
                className="border border-slate-200 rounded-lg px-3 py-2 w-48"
                placeholder="เติมงบเดือน มี.ค."
              />
            </div>
            <button
              onClick={handleTopUp}
              disabled={topUpLoading || !(parseFloat(topUpAmount) > 0)}
              className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50"
            >
              {topUpLoading ? <Loader2 size={18} className="animate-spin inline" /> : 'Top-up'}
            </button>
            {data?.pendingPayoutCount ? (
              <button
                onClick={handleProcessPending}
                disabled={processLoading || available <= 0}
                className="px-4 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700 disabled:opacity-50"
              >
                {processLoading ? <Loader2 size={18} className="animate-spin inline" /> : `Process ${data.pendingPayoutCount} Pending`}
              </button>
            ) : null}
          </div>
        </div>
      )}

      {/* Campaign Settings */}
      {budget && (
        <div className="bg-white rounded-xl border border-slate-100 p-6 shadow-sm space-y-4">
          <h2 className="font-bold text-slate-800 flex items-center gap-2">
            <Settings size={20} className="text-indigo-500" />
            Campaign Settings
          </h2>
          <div className="flex flex-wrap gap-6 items-center">
            <div className="flex items-center gap-2">
              <span className="text-sm text-slate-600">Program</span>
              <button
                onClick={handleToggleCampaign}
                disabled={campaignLoading}
                className={`px-4 py-2 rounded-lg font-medium ${budget.isActive ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-600'}`}
              >
                {budget.isActive ? 'ON' : 'OFF'}
              </button>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm text-slate-600">Commission %</span>
              <input
                type="number"
                min="0"
                max="100"
                step="0.1"
                value={rateInput}
                onChange={(e) => setRateInput(e.target.value)}
                className="border border-slate-200 rounded-lg px-3 py-2 w-20"
              />
              <button
                onClick={handleUpdateRate}
                disabled={campaignLoading || isNaN(parseFloat(rateInput))}
                className="px-3 py-2 bg-slate-100 rounded-lg hover:bg-slate-200 text-sm"
              >
                Update
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white rounded-xl border border-slate-100 p-6 shadow-sm">
          <Users size={24} className="text-indigo-500 mb-2" />
          <p className="text-sm text-slate-500">Total Referrers</p>
          <p className="text-2xl font-bold text-slate-800">{data?.totalReferrers ?? 0}</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-100 p-6 shadow-sm">
          <TrendingUp size={24} className="text-emerald-500 mb-2" />
          <p className="text-sm text-slate-500">Total Referrals</p>
          <p className="text-2xl font-bold text-slate-800">{data?.totalReferrals ?? 0}</p>
        </div>
        <div className="bg-amber-50 rounded-xl border border-amber-200 p-6 shadow-sm">
          <Gift size={24} className="text-amber-600 mb-2" />
          <p className="text-sm text-slate-500">Total Paid ({budget?.commissionRatePct ?? 1.5}%)</p>
          <p className="text-2xl font-bold text-amber-700">฿{(data?.totalPaid ?? 0).toLocaleString()}</p>
        </div>
      </div>

      {/* Fraud Detection */}
      {((data?.fraudSameBank?.length ?? 0) > 0 || (data?.fraudSameIp?.length ?? 0) > 0) && (
        <div className="bg-rose-50 rounded-xl border border-rose-200 p-6">
          <h2 className="font-bold text-rose-800 mb-4 flex items-center gap-2">
            <ShieldAlert size={20} /> Fraud Detection
          </h2>
          {data?.fraudSameBank?.length ? (
            <div className="mb-4">
              <p className="text-sm text-slate-600 mb-2 flex items-center gap-1">
                <Banknote size={16} /> Same bank account (referrer ↔ referee)
              </p>
              <div className="space-y-1">
                {data.fraudSameBank.map((f, i) => (
                  <div key={i} className="flex gap-2 text-sm font-mono bg-white p-2 rounded border border-rose-100">
                    <span>{f.referrerId.slice(0, 8)}...</span>
                    <span>↔</span>
                    <span>{f.refereeId.slice(0, 8)}...</span>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
          {data?.fraudSameIp?.length ? (
            <div>
              <p className="text-sm text-slate-600 mb-2 flex items-center gap-1">
                <ShieldAlert size={16} /> Same IP login (referrer ↔ referee)
              </p>
              <div className="space-y-1">
                {data.fraudSameIp.map((f, i) => (
                  <div key={i} className="flex gap-2 text-sm font-mono bg-white p-2 rounded border border-rose-100">
                    <span>{f.referrerId.slice(0, 8)}...</span>
                    <span>↔</span>
                    <span>{f.refereeId.slice(0, 8)}...</span>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      )}

      {data?.suspiciousInactive?.length ? (
        <div className="bg-amber-50 rounded-xl border border-amber-200 p-6">
          <h2 className="font-bold text-amber-800 mb-4 flex items-center gap-2">
            <AlertTriangle size={20} /> Suspicious: Many referrals, no jobs
          </h2>
          <p className="text-sm text-slate-600 mb-4">Referrers with 5+ signups but none completed a job (possible fake signups)</p>
          <div className="space-y-2">
            {data.suspiciousInactive.map((s) => (
              <div key={s.referrerId} className="flex justify-between p-3 bg-white rounded-lg border border-amber-100">
                <span className="font-mono text-sm">{s.referrerId.slice(0, 8)}...</span>
                <span className="text-amber-700 font-medium">{s.inactiveCount} inactive</span>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <div className="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden">
        <h2 className="p-4 border-b border-slate-100 font-bold text-slate-800">Top Referrers (This Week)</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-600">
              <tr>
                <th className="px-4 py-3 text-left">#</th>
                <th className="px-4 py-3 text-left">Name</th>
                <th className="px-4 py-3 text-left">Code</th>
                <th className="px-4 py-3 text-right">Referrals</th>
                <th className="px-4 py-3 text-right">Earned (Week)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {(data?.leaderboard || []).map((e, i) => (
                <tr key={e.userId} className="hover:bg-slate-50">
                  <td className="px-4 py-3 font-bold">{i + 1}</td>
                  <td className="px-4 py-3">{e.fullName}</td>
                  <td className="px-4 py-3 font-mono text-indigo-600">{e.referralCode}</td>
                  <td className="px-4 py-3 text-right">{e.referralCount}</td>
                  <td className="px-4 py-3 text-right font-medium text-amber-700">฿{e.earnedThisWeek.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {(data?.leaderboard?.length ?? 0) === 0 && (
          <p className="p-8 text-center text-slate-500">No referral data yet</p>
        )}
      </div>
    </div>
  );
};
