import React, { useEffect, useState } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { StatsCard } from "./StatsCard";
import { getAdsAdminSummary, getScaleHealth, type AdsSummary, type ScaleHealth } from "../services/adsAdminApi";

function formatNum(value: unknown, fallback = 0): string {
  const n = Number(value);
  return (Number.isFinite(n) ? n : fallback).toLocaleString();
}

function normalizeSummary(raw: AdsSummary | null | undefined): AdsSummary | null {
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

export const OverviewView: React.FC = () => {
  const [summary, setSummary] = useState<AdsSummary | null>(null);
  const [scale, setScale] = useState<ScaleHealth | null>(null);
  const [configured, setConfigured] = useState(true);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      getAdsAdminSummary(7),
      getScaleHealth().catch(() => null),
    ])
      .then(([r, s]) => {
        setSummary(normalizeSummary(r.summary));
        setConfigured(r.configured !== false);
        setScale(s);
      })
      .catch(() => setConfigured(false))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <p className="text-slate-500">กำลังโหลด...</p>;

  if (!configured) {
    return (
      <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 text-amber-800">
        Social Core Ads bridge ยังไม่ได้ตั้งค่า (SOCIAL_CORE_API_URL)
      </div>
    );
  }

  if (!summary) return <p className="text-slate-500">ไม่มีข้อมูลสรุป</p>;

  return (
    <div className="space-y-6">
      {scale ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="bg-white rounded-xl border border-slate-100 p-4 shadow-sm">
            <p className="text-xs text-slate-500">Rollout stage</p>
            <p className="text-lg font-bold text-slate-900 uppercase">{scale.rollout.stage}</p>
            <p className="text-xs text-slate-400 mt-1">
              Feed {scale.rollout.feedInjectionEnabled ? "on" : "off"}
            </p>
          </div>
          <div className="bg-white rounded-xl border border-slate-100 p-4 shadow-sm">
            <p className="text-xs text-slate-500">Circuit breaker</p>
            <p
              className={`text-lg font-bold ${
                scale.circuit.state === "open" ? "text-rose-600" : "text-emerald-700"
              }`}
            >
              {scale.circuit.state}
            </p>
            <p className="text-xs text-slate-400 mt-1">{scale.circuit.failures} recent failures</p>
          </div>
          <div className="bg-white rounded-xl border border-slate-100 p-4 shadow-sm">
            <p className="text-xs text-slate-500">Event outbox</p>
            <p className="text-lg font-bold text-slate-900">{scale.outbox.pending} pending</p>
            <p className="text-xs text-slate-400 mt-1">{scale.outbox.total} total events</p>
          </div>
          <div className="bg-white rounded-xl border border-slate-100 p-4 shadow-sm">
            <p className="text-xs text-slate-500">Background jobs</p>
            <ul className="text-xs mt-1 space-y-0.5 text-slate-700">
              <li>Recon: {scale.scheduler.dailyReconEnabled ? "on" : "off"}</li>
              <li>Optimization: {scale.scheduler.optimizationEnabled ? "on" : "off"}</li>
              <li>Warehouse: {scale.scheduler.warehouseEnabled ? "on" : "off"}</li>
              <li>Escrow expiry: {scale.scheduler.escrowExpiryEnabled ? "on" : "off"}</li>
            </ul>
            <p className="text-xs text-slate-400 mt-1 truncate">
              Last recon: {scale.scheduler.lastReconAt || "—"}
            </p>
          </div>
        </div>
      ) : null}

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <StatsCard title="Active campaigns" value={summary.activeCampaigns} color="bg-emerald-500" />
        <StatsCard title="Impressions (7d)" value={formatNum(summary.impressions)} color="bg-blue-500" />
        <StatsCard title="Clicks (7d)" value={formatNum(summary.clicks)} color="bg-violet-500" />
        <StatsCard title="CTR" value={`${summary.ctr}%`} color="bg-indigo-500" />
        <StatsCard title="Spend (THB)" value={formatNum(summary.spendThb)} color="bg-amber-500" />
        <StatsCard title="Paid / House" value={`${summary.paidCampaigns} / ${summary.houseCampaigns}`} />
      </div>

      <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100">
        <h3 className="font-semibold text-slate-800 mb-4">Impressions รายวัน</h3>
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

      {summary.daily?.length ? (
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100">
          <h3 className="font-semibold text-slate-800 mb-4">Surface breakdown (7d)</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {Object.entries(summary.surfaceBreakdown || {}).map(([surface, count]) => (
              <div key={surface} className="rounded-lg bg-slate-50 p-3 border border-slate-100">
                <p className="text-xs text-slate-500">{surface}</p>
                <p className="text-lg font-bold text-slate-900">{formatNum(count)}</p>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <div className="bg-white rounded-xl border border-slate-100 overflow-hidden">
        <div className="px-4 py-3 border-b bg-slate-50 font-semibold text-slate-700">Top campaigns</div>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-slate-500 border-b">
              <th className="p-3">Title</th>
              <th className="p-3">Advertiser</th>
              <th className="p-3">Impressions</th>
              <th className="p-3">CTR</th>
            </tr>
          </thead>
          <tbody>
            {(summary.topCampaigns || []).map((c) => (
              <tr key={c.id} className="border-b border-slate-50">
                <td className="p-3 font-medium">{c.title}</td>
                <td className="p-3">{c.advertiser}</td>
                <td className="p-3">{c.impressions}</td>
                <td className="p-3">{c.ctr}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
