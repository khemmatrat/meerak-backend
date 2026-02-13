/**
 * MarketCapManager — การจัดการมูลค่าบริษัทและการลงทุน
 * Market Cap • ตารางนักลงทุนและ % การถือหุ้น • มูลค่าหุ้น • เงินลงทุน • การเติบโต
 */
import React, { useState, useEffect } from "react";
import {
  TrendingUp,
  Users,
  DollarSign,
  PieChart as PieChartIcon,
  RefreshCw,
  Download,
  Loader2,
  Plus,
} from "lucide-react";

export interface InvestorEntry {
  id: string;
  name: string;
  shares: number;
  invested_amount: number;
  invested_at: string;
  note?: string;
}

export interface MarketCapSnapshot {
  date: string;
  market_cap: number;
  total_shares: number;
}

const MOCK_INVESTORS: InvestorEntry[] = [
  {
    id: "inv-1",
    name: "Founder",
    shares: 6000,
    invested_amount: 500000,
    invested_at: "2023-01-01",
  },
  {
    id: "inv-2",
    name: "Angel A",
    shares: 2000,
    invested_amount: 200000,
    invested_at: "2023-06-15",
  },
  {
    id: "inv-3",
    name: "Angel B",
    shares: 1500,
    invested_amount: 150000,
    invested_at: "2024-01-10",
  },
  {
    id: "inv-4",
    name: "VC Seed",
    shares: 500,
    invested_amount: 100000,
    invested_at: "2024-06-01",
  },
];

const MOCK_GROWTH: MarketCapSnapshot[] = [
  { date: "2023-Q1", market_cap: 500000, total_shares: 10000 },
  { date: "2023-Q2", market_cap: 700000, total_shares: 10000 },
  { date: "2023-Q3", market_cap: 900000, total_shares: 10000 },
  { date: "2023-Q4", market_cap: 1100000, total_shares: 10000 },
  { date: "2024-Q1", market_cap: 1400000, total_shares: 10000 },
  { date: "2024-Q2", market_cap: 1800000, total_shares: 10000 },
];

const TOTAL_SHARES = 10000;

export const MarketCapManager: React.FC = () => {
  const [investors, setInvestors] = useState<InvestorEntry[]>(MOCK_INVESTORS);
  const [growth, setGrowth] = useState<MarketCapSnapshot[]>(MOCK_GROWTH);
  const [currentMarketCap, setCurrentMarketCap] = useState(1800000);
  const [loading, setLoading] = useState(false);

  const totalShares = TOTAL_SHARES;
  const shareValue = totalShares > 0 ? currentMarketCap / totalShares : 0;

  const investorsWithOwnership = investors.map((inv) => ({
    ...inv,
    ownership_percent: totalShares > 0 ? (inv.shares / totalShares) * 100 : 0,
    share_value: shareValue * inv.shares,
  }));

  const totalInvested = investors.reduce((s, i) => s + i.invested_amount, 0);
  const totalReturn = currentMarketCap;
  const returnPercent =
    totalInvested > 0
      ? ((totalReturn - totalInvested) / totalInvested) * 100
      : 0;

  const fetchData = async () => {
    setLoading(true);
    try {
      await new Promise((r) => setTimeout(r, 400));
      setInvestors(MOCK_INVESTORS);
      setGrowth(MOCK_GROWTH);
      setCurrentMarketCap(1800000);
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleExport = () => {
    const header = "Name,Shares,Ownership %,Invested,Share Value,Invested At\n";
    const rows = investorsWithOwnership
      .map(
        (i) =>
          `${i.name},${i.shares},${i.ownership_percent.toFixed(2)}%,${
            i.invested_amount
          },${i.share_value.toFixed(2)},${i.invested_at}`
      )
      .join("\n");
    const blob = new Blob([header + rows], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `market_cap_investors_${new Date()
      .toISOString()
      .slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <div className="bg-gradient-to-r from-violet-700 to-purple-700 rounded-xl p-6 text-white">
        <h2 className="text-xl font-bold mb-1 flex items-center gap-2">
          <PieChartIcon size={24} /> การจัดการหุ้นส่วน & Market Cap
        </h2>
        <p className="text-violet-100 text-sm">
          Market Cap ปัจจุบัน • ตารางนักลงทุนและ % การถือหุ้น • มูลค่าหุ้น •
          การเติบโตของบริษัท
        </p>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-4">
        <h3 className="font-bold text-slate-800">มูลค่าบริษัทและการลงทุน</h3>
        <div className="flex gap-2">
          <button
            onClick={fetchData}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 rounded-lg text-sm font-medium hover:bg-slate-50 disabled:opacity-50"
          >
            {loading ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              <RefreshCw size={16} />
            )}
            Refresh
          </button>
          <button
            onClick={handleExport}
            className="flex items-center gap-2 px-4 py-2 bg-violet-600 text-white rounded-lg text-sm font-medium hover:bg-violet-700"
          >
            <Download size={16} /> Export
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-xl border border-slate-100 shadow-sm">
          <div className="flex items-center gap-2 mb-2">
            <DollarSign className="text-violet-600" size={20} />
            <span className="text-sm font-medium text-slate-500">
              Market Cap ปัจจุบัน
            </span>
          </div>
          <p className="text-2xl font-bold text-slate-800">
            ฿
            {currentMarketCap.toLocaleString(undefined, {
              minimumFractionDigits: 2,
            })}
          </p>
        </div>
        <div className="bg-white p-5 rounded-xl border border-slate-100 shadow-sm">
          <div className="flex items-center gap-2 mb-2">
            <TrendingUp className="text-emerald-600" size={20} />
            <span className="text-sm font-medium text-slate-500">
              มูลค่าหุ้น (ต่อหุ้น)
            </span>
          </div>
          <p className="text-2xl font-bold text-slate-800">
            ฿
            {shareValue.toLocaleString(undefined, { minimumFractionDigits: 2 })}
          </p>
        </div>
        <div className="bg-white p-5 rounded-xl border border-slate-100 shadow-sm">
          <div className="flex items-center gap-2 mb-2">
            <Users className="text-blue-600" size={20} />
            <span className="text-sm font-medium text-slate-500">
              เงินลงทุนรวม
            </span>
          </div>
          <p className="text-2xl font-bold text-slate-800">
            ฿{totalInvested.toLocaleString()}
          </p>
        </div>
        <div className="bg-white p-5 rounded-xl border border-slate-100 shadow-sm">
          <div className="flex items-center gap-2 mb-2">
            <PieChartIcon className="text-amber-600" size={20} />
            <span className="text-sm font-medium text-slate-500">
              ผลตอบแทน (รวม)
            </span>
          </div>
          <p
            className={`text-2xl font-bold ${
              returnPercent >= 0 ? "text-emerald-600" : "text-rose-600"
            }`}
          >
            {returnPercent >= 0 ? "+" : ""}
            {returnPercent.toFixed(1)}%
          </p>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
        <div className="p-4 border-b border-slate-100 bg-slate-50/50">
          <h3 className="font-bold text-slate-800">
            ตารางนักลงทุนและ % การถือหุ้น
          </h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-600">
              <tr>
                <th className="px-6 py-3 text-left font-semibold">ชื่อ</th>
                <th className="px-6 py-3 text-right font-semibold">หุ้น</th>
                <th className="px-6 py-3 text-right font-semibold">
                  % ถือหุ้น
                </th>
                <th className="px-6 py-3 text-right font-semibold">
                  เงินลงทุน
                </th>
                <th className="px-6 py-3 text-right font-semibold">
                  มูลค่าหุ้นปัจจุบัน
                </th>
                <th className="px-6 py-3 text-left font-semibold">
                  วันที่ลงทุน
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {investorsWithOwnership.map((inv) => (
                <tr key={inv.id} className="hover:bg-slate-50/50">
                  <td className="px-6 py-3 font-medium text-slate-800">
                    {inv.name}
                  </td>
                  <td className="px-6 py-3 text-right">
                    {inv.shares.toLocaleString()}
                  </td>
                  <td className="px-6 py-3 text-right">
                    {inv.ownership_percent.toFixed(2)}%
                  </td>
                  <td className="px-6 py-3 text-right">
                    ฿{inv.invested_amount.toLocaleString()}
                  </td>
                  <td className="px-6 py-3 text-right font-medium">
                    ฿
                    {inv.share_value.toLocaleString(undefined, {
                      minimumFractionDigits: 2,
                    })}
                  </td>
                  <td className="px-6 py-3 text-slate-600">
                    {inv.invested_at}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
        <div className="p-4 border-b border-slate-100 bg-slate-50/50">
          <h3 className="font-bold text-slate-800">
            การเติบโตของ Market Cap (ตามช่วง)
          </h3>
        </div>
        <div className="p-4 overflow-x-auto">
          <div className="flex gap-2 flex-wrap">
            {growth.map((g, i) => (
              <div
                key={g.date}
                className="px-4 py-3 rounded-lg border border-slate-200 bg-slate-50 min-w-[120px] text-center"
              >
                <p className="text-xs text-slate-500">{g.date}</p>
                <p className="font-bold text-slate-800">
                  ฿{(g.market_cap / 1000).toFixed(0)}K
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
