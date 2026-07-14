/**
 * Stability Fund Dashboard — Admin-only view
 * Shows: Total Reserve Cash, Projected Monthly Interest (2% annual)
 */
import React, { useState, useEffect } from 'react';
import { Shield, TrendingUp, RefreshCw, Loader2 } from 'lucide-react';
import { getStabilityFund, runMaturityRewardsCheck } from '../services/adminApi';

export const StabilityFundDashboardView: React.FC = () => {
  const [data, setData] = useState<{
    total_reserve_cash: number;
    projected_monthly_interest: number;
    annual_rate_percent: number;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [maturityRunning, setMaturityRunning] = useState(false);

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await getStabilityFund();
      setData(res);
    } catch (e) {
      setError((e as Error)?.message || 'โหลดข้อมูลไม่สำเร็จ');
      setData(null);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleRunMaturity = async () => {
    setMaturityRunning(true);
    try {
      await runMaturityRewardsCheck();
      await fetchData();
    } catch (e) {
      setError((e as Error)?.message || 'รัน Maturity Rewards ไม่สำเร็จ');
    }
    setMaturityRunning(false);
  };

  const fmt = (n: number) => n.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
          <Shield size={24} className="text-amber-500" />
          Stability Fund Dashboard
        </h2>
        <div className="flex gap-2">
          <button
            onClick={handleRunMaturity}
            disabled={maturityRunning}
            className="px-4 py-2 bg-amber-100 text-amber-800 rounded-lg text-sm font-medium hover:bg-amber-200 flex items-center gap-2 disabled:opacity-50"
          >
            {maturityRunning ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
            รัน Maturity Rewards
          </button>
          <button
            onClick={fetchData}
            disabled={loading}
            className="px-4 py-2 bg-slate-100 text-slate-700 rounded-lg text-sm font-medium hover:bg-slate-200 flex items-center gap-2 disabled:opacity-50"
          >
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
            Refresh
          </button>
        </div>
      </div>

      {error && (
        <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl text-rose-700">
          {error}
        </div>
      )}

      {loading && !data ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 size={32} className="animate-spin text-slate-400" />
        </div>
      ) : data ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-gradient-to-br from-amber-50 to-amber-100 border-2 border-amber-200 rounded-2xl p-6 shadow-sm">
            <p className="text-sm font-bold text-amber-800 uppercase tracking-wide mb-2">
              💰 Total Reserve Cash (เงินเย็นสะสมทั้งหมด)
            </p>
            <p className="text-3xl font-bold text-amber-900">
              ฿{fmt(data.total_reserve_cash)}
            </p>
            <p className="text-xs text-amber-700 mt-2">
              รวมจาก event_type = platform_stability_reserve (60% ของ insurance claims/refunds)
            </p>
          </div>

          <div className="bg-gradient-to-br from-emerald-50 to-emerald-100 border-2 border-emerald-200 rounded-2xl p-6 shadow-sm">
            <p className="text-sm font-bold text-emerald-800 uppercase tracking-wide mb-2 flex items-center gap-1">
              <TrendingUp size={14} />
              Projected Monthly Interest (คำนวณดอกเบี้ย 2%/ปี)
            </p>
            <p className="text-3xl font-bold text-emerald-900">
              ฿{fmt(data.projected_monthly_interest)}
            </p>
            <p className="text-xs text-emerald-700 mt-2">
              ถ้าฝากธนาคารกินดอก {data.annual_rate_percent}% ต่อปี = เงินฟรีเดือนละเท่านี้
            </p>
          </div>
        </div>
      ) : null}

      <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 text-sm text-slate-600">
        <p className="font-semibold text-slate-800 mb-2">📋 Platform Stability Policy</p>
        <p>60% ของกองทุนประกันถูกสำรองไว้เพื่อความมั่นคงของเครือข่ายและสภาพคล่อง มีเพียง 40% ที่เบิกจ่ายได้ทันที</p>
      </div>
    </div>
  );
};
