import React, { useState, useEffect, useCallback } from 'react';
import {
  Landmark,
  TrendingUp,
  PieChart,
  Shield,
  Target,
  ArrowUpRight,
  RefreshCw,
  Loader2,
  Globe,
  Pencil,
  BarChart3,
  DollarSign,
  X,
} from 'lucide-react';
import { PieChart as RechartsPie, Pie, Cell, ResponsiveContainer, Tooltip, BarChart, Bar, XAxis, YAxis, CartesianGrid, Legend } from 'recharts';
import {
  getFinancialStrategy,
  getFinancialStrategyAll,
  patchFinancialStrategy,
  getExchangeRates,
  patchExchangeRates,
  FINANCIAL_STRATEGY_REGIONS,
  getAdminToken,
} from '../services/adminApi';
import type { FinancialStrategyResponse, FinancialStrategyAllResponse, ExchangeRateEntry } from '../services/adminApi';
import { MOCK_FINANCIAL_STRATEGY } from '../constants';

const COLORS = ['#6366f1', '#10b981', '#f59e0b', '#f43f5e', '#8b5cf6'];

function formatCurrency(amount: number, currency: string): string {
  const symbols: Record<string, string> = {
    THB: '฿',
    IDR: 'Rp',
    VND: '₫',
    MYR: 'RM',
    LAK: '₭',
  };
  const sym = symbols[currency] || currency + ' ';
  return sym + amount.toLocaleString('en-US', { maximumFractionDigits: 0 });
}

export const FinancialStrategyView: React.FC = () => {
  const [region, setRegion] = useState('TH');
  const [data, setData] = useState<FinancialStrategyResponse | null>(null);
  const [allData, setAllData] = useState<FinancialStrategyAllResponse | null>(null);
  const [exchangeRates, setExchangeRates] = useState<ExchangeRateEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editForm, setEditForm] = useState<{
    expansionBudget: number;
    allocation: Array<{ category: string; percentage: number; amount: number; description: string }>;
  } | null>(null);
  const [saving, setSaving] = useState(false);
  const [showExchangeModal, setShowExchangeModal] = useState(false);
  const [exchangeForm, setExchangeForm] = useState<Record<string, number>>({});
  const useBackend = !!getAdminToken();

  const fetchStrategy = useCallback(async () => {
    if (!useBackend) {
      setData({
        region: 'TH',
        currency: 'THB',
        totalReserves: MOCK_FINANCIAL_STRATEGY.totalReserves,
        monthlyBurnRate: MOCK_FINANCIAL_STRATEGY.monthlyBurnRate,
        runwayMonths: MOCK_FINANCIAL_STRATEGY.runwayMonths,
        expansionBudget: MOCK_FINANCIAL_STRATEGY.expansionBudget,
        allocation: MOCK_FINANCIAL_STRATEGY.allocation,
        updatedAt: null,
      });
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [res, allRes, ratesRes] = await Promise.all([
        getFinancialStrategy(region),
        getFinancialStrategyAll('THB').catch(() => null),
        getExchangeRates('THB').catch(() => ({ rates: [] })),
      ]);
      setData(res);
      setAllData(allRes || null);
      setExchangeRates(ratesRes.rates || []);
      setExchangeForm(
        (ratesRes.rates || []).reduce((acc, r) => ({ ...acc, [r.fromCurrency]: r.rate }), {}
      ));
    } catch (e) {
      setError((e as Error).message || 'Failed to load strategy');
      setData({
        region,
        currency: FINANCIAL_STRATEGY_REGIONS.find((r) => r.code === region)?.currency || 'THB',
        totalReserves: MOCK_FINANCIAL_STRATEGY.totalReserves,
        monthlyBurnRate: MOCK_FINANCIAL_STRATEGY.monthlyBurnRate,
        runwayMonths: MOCK_FINANCIAL_STRATEGY.runwayMonths,
        expansionBudget: MOCK_FINANCIAL_STRATEGY.expansionBudget,
        allocation: MOCK_FINANCIAL_STRATEGY.allocation,
        updatedAt: null,
      });
    } finally {
      setLoading(false);
    }
  }, [region, useBackend]);

  useEffect(() => {
    fetchStrategy();
  }, [fetchStrategy]);

  const openEditModal = () => {
    if (!data) return;
    setEditForm({
      expansionBudget: data.expansionBudget,
      allocation: data.allocation.map((a) => ({ ...a })),
    });
    setShowEditModal(true);
  };

  const handleSaveStrategy = async () => {
    if (!editForm || !useBackend) return;
    setSaving(true);
    try {
      await patchFinancialStrategy({
        region,
        expansionBudget: editForm.expansionBudget,
        allocation: editForm.allocation,
      });
      setShowEditModal(false);
      fetchStrategy();
    } catch (e) {
      alert((e as Error).message || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveExchangeRates = async () => {
    if (!useBackend) return;
    setSaving(true);
    try {
      const rates = Object.entries(exchangeForm)
        .filter(([, v]) => !isNaN(v) && v > 0)
        .map(([fromCurrency, rate]) => ({ fromCurrency, rate }));
      await patchExchangeRates({ baseCurrency: 'THB', rates });
      setShowExchangeModal(false);
      fetchStrategy();
    } catch (e) {
      alert((e as Error).message || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const allocationData = data?.allocation ?? [];
  const runwayStatus = data ? (data.runwayMonths >= 18 ? 'Healthy' : data.runwayMonths >= 6 ? 'Moderate' : 'Critical') : 'Healthy';
  const runwayPercent = data ? Math.min(100, (data.runwayMonths / 18) * 100) : 85;

  const chartData = allData?.strategies?.map((s) => ({
    name: FINANCIAL_STRATEGY_REGIONS.find((r) => r.code === s.region)?.name || s.region,
    region: s.region,
    reserves: s.totalReservesInBase,
    burnRate: s.monthlyBurnRateInBase,
    runway: s.runwayMonths,
  })) ?? [];

  return (
    <div className="space-y-8">
      {/* Region selector + Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-lg px-3 py-2 shadow-sm">
            <Globe size={18} className="text-slate-500" />
            <select
              value={region}
              onChange={(e) => setRegion(e.target.value)}
              className="bg-transparent text-slate-800 font-medium focus:outline-none focus:ring-0 cursor-pointer"
            >
              {FINANCIAL_STRATEGY_REGIONS.map((r) => (
                <option key={r.code} value={r.code}>
                  {r.flag} {r.name} ({r.currency})
                </option>
              ))}
            </select>
          </div>
          {useBackend && (
            <>
              <button
                onClick={fetchStrategy}
                disabled={loading}
                className="p-2 rounded-lg border border-slate-200 hover:bg-slate-50 transition-colors disabled:opacity-50"
                title="Refresh"
              >
                {loading ? <Loader2 size={18} className="animate-spin text-slate-500" /> : <RefreshCw size={18} className="text-slate-600" />}
              </button>
              <button
                onClick={openEditModal}
                className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700"
              >
                <Pencil size={16} /> แก้ไข Strategy
              </button>
              <button
                onClick={() => setShowExchangeModal(true)}
                className="flex items-center gap-2 px-4 py-2 bg-amber-600 text-white rounded-lg text-sm font-medium hover:bg-amber-700"
              >
                <DollarSign size={16} /> อัตราแลกเปลี่ยน
              </button>
            </>
          )}
        </div>
      </div>

      {error && (
        <div className="bg-amber-50 border border-amber-200 text-amber-800 px-4 py-2 rounded-lg text-sm">
          {error} — แสดงข้อมูล fallback
        </div>
      )}

      {/* Cross-region comparison chart */}
      {allData && chartData.length > 0 && (
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
          <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2">
            <BarChart3 size={20} className="text-indigo-600" /> เปรียบเทียบข้าม Region (THB)
          </h3>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} tickFormatter={(v) => v >= 1e6 ? `${(v / 1e6).toFixed(1)}M` : v.toLocaleString()} />
                <Tooltip formatter={(v: number) => v.toLocaleString()} />
                <Legend />
                <Bar dataKey="reserves" name="Reserves (THB)" fill="#6366f1" radius={[4, 4, 0, 0]} />
                <Bar dataKey="burnRate" name="Monthly Burn (THB)" fill="#f59e0b" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-4">
            {chartData.map((d) => (
              <div key={d.region} className="bg-slate-50 rounded-lg p-3">
                <p className="text-xs text-slate-500">{d.name}</p>
                <p className="font-bold text-slate-800">Runway: {d.runway} mo</p>
              </div>
            ))}
          </div>
          {allData.aggregated && (
            <div className="mt-4 p-3 bg-indigo-50 rounded-lg border border-indigo-100">
              <p className="text-sm font-medium text-indigo-900">รวมทุก Region (THB)</p>
              <p className="text-lg font-bold text-indigo-800">
                Reserves: ฿{allData.aggregated.totalReservesInBase.toLocaleString()} • Burn: ฿{allData.aggregated.totalMonthlyBurnInBase.toLocaleString()} • Runway: {allData.aggregated.runwayMonths} mo
              </p>
            </div>
          )}
        </div>
      )}

      <div className="bg-slate-900 text-white p-8 rounded-2xl shadow-xl border border-slate-700 relative overflow-hidden">
        <div className="absolute top-0 right-0 p-32 bg-indigo-500 rounded-full blur-3xl opacity-20 -mr-16 -mt-16 pointer-events-none"></div>
        <div className="relative z-10 flex justify-between items-start flex-wrap gap-4">
          <div>
            <h2 className="text-2xl font-bold flex items-center gap-3 mb-2">
              <Landmark size={28} className="text-indigo-400" />
              Financial Intelligence & Global Strategy
            </h2>
            <p className="text-indigo-200">
              Executive View: Capital Allocation, Reserves, and Expansion Planning — Asia Expansion Ready
            </p>
          </div>
          {data && (
            <div className="text-right">
              <p className="text-xs text-slate-400 uppercase tracking-widest mb-1">Total Reserves ({data.currency})</p>
              <h3 className="text-4xl font-bold font-mono">{formatCurrency(data.totalReserves, data.currency)}</h3>
              <p className="text-xs text-emerald-400 mt-2 flex items-center justify-end gap-1">
                <TrendingUp size={12} /> Runway: {data.runwayMonths} Months
              </p>
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Allocation Chart */}
        <div className="lg:col-span-2 bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
          <h3 className="font-bold text-slate-800 mb-6 flex items-center gap-2">
            <PieChart size={20} className="text-indigo-600" /> Capital Allocation Strategy
          </h3>
          <div className="flex flex-col md:flex-row items-center gap-8">
            <div className="w-full md:w-1/2 h-64">
              {allocationData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <RechartsPie>
                    <Pie
                      data={allocationData}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={80}
                      paddingAngle={5}
                      dataKey="percentage"
                    >
                      {allocationData.map((_, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(v: number) => `${v}%`} />
                  </RechartsPie>
                </ResponsiveContainer>
              ) : (
                <div className="h-full flex items-center justify-center text-slate-400">No allocation data</div>
              )}
            </div>
            <div className="w-full md:w-1/2 space-y-4">
              {allocationData.map((item, index) => (
                <div key={index} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                  <div className="flex items-center gap-3">
                    <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: COLORS[index % COLORS.length] }}></div>
                    <div>
                      <p className="font-bold text-slate-700 text-sm">{item.category}</p>
                      <p className="text-xs text-slate-500">{item.description}</p>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="font-bold text-slate-800 text-sm">{item.percentage}%</p>
                    <p className="text-xs text-slate-500">{formatCurrency(item.amount, data?.currency ?? 'THB')}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* KPIs */}
        <div className="space-y-6">
          <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
            <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2">
              <Shield size={20} className="text-emerald-600" /> Emergency Reserves
            </h3>
            <div className="relative pt-2">
              <div className="flex justify-between text-sm mb-2">
                <span className="text-slate-600">Funding Status</span>
                <span
                  className={`font-bold ${
                    runwayStatus === 'Healthy' ? 'text-emerald-600' : runwayStatus === 'Moderate' ? 'text-amber-600' : 'text-rose-600'
                  }`}
                >
                  {runwayStatus}
                </span>
              </div>
              <div className="w-full h-3 bg-slate-100 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full ${
                    runwayStatus === 'Healthy' ? 'bg-emerald-500' : runwayStatus === 'Moderate' ? 'bg-amber-500' : 'bg-rose-500'
                  }`}
                  style={{ width: `${runwayPercent}%` }}
                ></div>
              </div>
              <p className="text-xs text-slate-400 mt-2">Target: 18 months runway</p>
            </div>
          </div>

          {data && (
            <div className="bg-indigo-50 p-6 rounded-xl border border-indigo-100">
              <h3 className="font-bold text-indigo-900 mb-2 flex items-center gap-2">
                <Target size={20} /> Expansion Budget
              </h3>
              <p className="text-3xl font-bold text-indigo-800 mb-1">{formatCurrency(data.expansionBudget, data.currency)}</p>
              <p className="text-sm text-indigo-600 mb-4">Allocated for Asia Expansion</p>
              <button
                onClick={openEditModal}
                className="w-full py-2 bg-indigo-600 text-white rounded-lg font-bold text-sm hover:bg-indigo-700 transition-colors flex items-center justify-center gap-2"
              >
                แก้ไข Strategy <ArrowUpRight size={16} />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Edit Modal */}
      {showEditModal && editForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-slate-200 flex justify-between items-center">
              <h3 className="text-xl font-bold text-slate-800">แก้ไข Financial Strategy ({region})</h3>
              <button onClick={() => setShowEditModal(false)} className="p-2 hover:bg-slate-100 rounded-lg">
                <X size={20} />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Expansion Budget</label>
                <input
                  type="number"
                  value={editForm.expansionBudget}
                  onChange={(e) => setEditForm({ ...editForm, expansionBudget: parseFloat(e.target.value) || 0 })}
                  className="w-full border border-slate-200 rounded-lg px-4 py-2"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Allocation</label>
                <div className="space-y-2">
                  {editForm.allocation.map((a, i) => (
                    <div key={i} className="flex gap-2 items-center">
                      <input
                        type="text"
                        value={a.category}
                        onChange={(e) => {
                          const next = [...editForm.allocation];
                          next[i] = { ...next[i], category: e.target.value };
                          setEditForm({ ...editForm, allocation: next });
                        }}
                        placeholder="Category"
                        className="flex-1 border border-slate-200 rounded px-2 py-1 text-sm"
                      />
                      <input
                        type="number"
                        value={a.percentage}
                        onChange={(e) => {
                          const next = [...editForm.allocation];
                          next[i] = { ...next[i], percentage: parseFloat(e.target.value) || 0 };
                          setEditForm({ ...editForm, allocation: next });
                        }}
                        className="w-16 border border-slate-200 rounded px-2 py-1 text-sm"
                      />
                      <span className="text-slate-500">%</span>
                      <input
                        type="number"
                        value={a.amount}
                        onChange={(e) => {
                          const next = [...editForm.allocation];
                          next[i] = { ...next[i], amount: parseFloat(e.target.value) || 0 };
                          setEditForm({ ...editForm, allocation: next });
                        }}
                        className="w-28 border border-slate-200 rounded px-2 py-1 text-sm"
                      />
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <div className="p-6 border-t border-slate-200 flex justify-end gap-2">
              <button onClick={() => setShowEditModal(false)} className="px-4 py-2 bg-slate-100 text-slate-700 rounded-lg font-medium">
                ยกเลิก
              </button>
              <button onClick={handleSaveStrategy} disabled={saving} className="px-4 py-2 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700 disabled:opacity-50">
                {saving ? 'กำลังบันทึก...' : 'บันทึก'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Exchange Rates Modal */}
      {showExchangeModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full">
            <div className="p-6 border-b border-slate-200 flex justify-between items-center">
              <h3 className="text-xl font-bold text-slate-800">อัตราแลกเปลี่ยน (เทียบ THB)</h3>
              <button onClick={() => setShowExchangeModal(false)} className="p-2 hover:bg-slate-100 rounded-lg">
                <X size={20} />
              </button>
            </div>
            <div className="p-6 space-y-3">
              <p className="text-sm text-slate-500">1 หน่วย = กี่ THB</p>
              {['THB', 'IDR', 'VND', 'MYR', 'LAK'].map((cur) => (
                <div key={cur} className="flex items-center justify-between">
                  <span className="font-medium">{cur}</span>
                  <input
                    type="number"
                    step="0.000001"
                    value={exchangeForm[cur] ?? 1}
                    onChange={(e) => setExchangeForm({ ...exchangeForm, [cur]: parseFloat(e.target.value) || 0 })}
                    className="w-32 border border-slate-200 rounded px-3 py-2 text-sm"
                  />
                </div>
              ))}
            </div>
            <div className="p-6 border-t border-slate-200 flex justify-end gap-2">
              <button onClick={() => setShowExchangeModal(false)} className="px-4 py-2 bg-slate-100 text-slate-700 rounded-lg font-medium">
                ยกเลิก
              </button>
              <button onClick={handleSaveExchangeRates} disabled={saving} className="px-4 py-2 bg-amber-600 text-white rounded-lg font-medium hover:bg-amber-700 disabled:opacity-50">
                {saving ? 'กำลังบันทึก...' : 'บันทึก'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
