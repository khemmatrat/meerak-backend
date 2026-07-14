import React, { useCallback, useEffect, useState } from "react";
import {
  Megaphone,
  ExternalLink,
  RefreshCw,
  TrendingUp,
  Loader2,
} from "lucide-react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { getAdminAdsSummary, type AdminAdsSummary } from "../services/adminApi";

const AdsSummaryStatCard: React.FC<{
  title: string;
  value: string | number;
  color?: string;
}> = ({ title, value, color = "text-indigo-600" }) => (
  <div className="bg-white rounded-xl p-5 shadow-sm border border-slate-100">
    <p className="text-sm text-slate-500">{title}</p>
    <p className={`text-2xl font-bold mt-1 ${color}`}>{value}</p>
  </div>
);

const ADS_ADMIN_URL =
  import.meta.env.VITE_ADS_ADMIN_PORTAL_URL || "http://localhost:3003";

function formatNum(value: unknown, fallback = 0): string {
  const n = Number(value);
  return (Number.isFinite(n) ? n : fallback).toLocaleString();
}

function normalizeSummary(raw: AdminAdsSummary | null | undefined): AdminAdsSummary | null {
  if (!raw || typeof raw !== "object") return null;
  return {
    activeCampaigns: Number(raw.activeCampaigns) || 0,
    houseCampaigns: Number(raw.houseCampaigns) || 0,
    paidCampaigns: Number(raw.paidCampaigns) || 0,
    impressions: Number(raw.impressions) || 0,
    clicks: Number(raw.clicks) || 0,
    ctr: Number(raw.ctr) || 0,
    spendMicro: String(raw.spendMicro ?? "0"),
    spendThb: Number(raw.spendThb) || 0,
    daily: Array.isArray(raw.daily) ? raw.daily : [],
    surfaceBreakdown: raw.surfaceBreakdown ?? {},
    topCampaigns: Array.isArray(raw.topCampaigns) ? raw.topCampaigns : [],
  };
}

export const AdsSummaryDashboardView: React.FC = () => {
  const [summary, setSummary] = useState<AdminAdsSummary | null>(null);
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [range, setRange] = useState<"7d" | "30d">("7d");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getAdminAdsSummary(range);
      setSummary(normalizeSummary(data.summary));
      setConfigured(data.configured !== false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "โหลดไม่สำเร็จ");
      setSummary(null);
      setConfigured(false);
    } finally {
      setLoading(false);
    }
  }, [range]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="space-y-6 p-4 md:p-6 max-w-6xl">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <TrendingUp className="text-indigo-600" size={28} />
            Ads Summary
          </h1>
          <p className="text-slate-500 text-sm mt-1">
            ภาพรวม Marketplace Ads จาก Social Core (สรุปสำหรับ Admin เส้นทางที่ 1)
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <div className="flex rounded-lg border border-slate-200 overflow-hidden">
            {(["7d", "30d"] as const).map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setRange(r)}
                className={`px-3 py-1.5 text-sm ${
                  range === r ? "bg-indigo-600 text-white" : "bg-white text-slate-600"
                }`}
              >
                {r}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => void load()}
            className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-200 text-sm"
          >
            <RefreshCw size={14} /> รีเฟรช
          </button>
          <a
            href={ADS_ADMIN_URL}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-slate-900 text-white text-sm"
          >
            <ExternalLink size={14} /> เปิด Ads Admin (เส้นทาง 2)
          </a>
        </div>
      </div>

      {configured === false && (
        <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-sm">
          Social Core Ads bridge ยังไม่ได้ตั้งค่าบน backend
        </div>
      )}

      {error && (
        <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm">{error}</div>
      )}

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="animate-spin text-indigo-500" size={32} />
        </div>
      ) : summary ? (
        <>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
            <AdsSummaryStatCard title="Active" value={summary.activeCampaigns} color="text-emerald-600" />
            <AdsSummaryStatCard title="Impressions" value={formatNum(summary.impressions)} color="text-blue-600" />
            <AdsSummaryStatCard title="Clicks" value={formatNum(summary.clicks)} color="text-violet-600" />
            <AdsSummaryStatCard title="CTR" value={`${summary.ctr}%`} color="text-indigo-600" />
            <AdsSummaryStatCard title="Spend THB" value={formatNum(summary.spendThb)} color="text-amber-600" />
            <AdsSummaryStatCard
              title="Paid / House"
              value={`${summary.paidCampaigns} / ${summary.houseCampaigns}`}
              color="text-slate-600"
            />
          </div>

          <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100">
            <h3 className="font-semibold text-slate-800 mb-4">Performance trend</h3>
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={summary.daily || []}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} stroke="#64748b" />
                  <YAxis tick={{ fontSize: 11 }} stroke="#64748b" />
                  <Tooltip contentStyle={{ borderRadius: 8 }} />
                  <Line type="monotone" dataKey="impressions" stroke="#6366f1" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="clicks" stroke="#10b981" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-slate-100 overflow-hidden shadow-sm">
            <div className="px-4 py-3 border-b bg-slate-50 font-semibold text-slate-700 flex items-center gap-2">
              <Megaphone size={16} /> Top campaigns
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-slate-500 border-b bg-slate-50">
                  <th className="p-3">Title</th>
                  <th className="p-3">Advertiser</th>
                  <th className="p-3">Impressions</th>
                  <th className="p-3">CTR</th>
                  <th className="p-3">Type</th>
                </tr>
              </thead>
              <tbody>
                {(summary.topCampaigns || []).map((c) => (
                  <tr key={c.id} className="border-b border-slate-50">
                    <td className="p-3 font-medium">{c.title}</td>
                    <td className="p-3">{c.advertiser}</td>
                    <td className="p-3">{c.impressions}</td>
                    <td className="p-3">{c.ctr}%</td>
                    <td className="p-3">
                      <span
                        className={`text-xs px-2 py-0.5 rounded-full ${
                          c.isHouse ? "bg-slate-100 text-slate-600" : "bg-indigo-50 text-indigo-700"
                        }`}
                      >
                        {c.isHouse ? "House" : "Paid"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : (
        !error && <p className="text-slate-500 text-center py-12">ไม่มีข้อมูลสรุป</p>
      )}
    </div>
  );
};
