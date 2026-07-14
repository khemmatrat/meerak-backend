import React, { useEffect, useState } from "react";
import {
  getAdsPopulation,
  getAdsBenchmarks,
  runAdsOptimization,
  getOptimizationLog,
  type AdsPopulationSummary,
  type AdsBenchmarkRow,
  type OptimizationLogRow,
} from "../services/adsAdminApi";

const OBJECTIVE_LABELS: Record<string, string> = {
  TRAFFIC: "Traffic",
  VIDEO_VIEWS: "Video views",
  STORY_VIEWS: "Story views",
  MARKETPLACE_LEADS: "Marketplace leads",
  PROFILE_VISITS: "Profile visits",
};

export const TrustView: React.FC = () => {
  const [population, setPopulation] = useState<AdsPopulationSummary | null>(null);
  const [benchmarks, setBenchmarks] = useState<AdsBenchmarkRow[]>([]);
  const [optLogs, setOptLogs] = useState<OptimizationLogRow[]>([]);
  const [rangeDays, setRangeDays] = useState(7);
  const [loading, setLoading] = useState(true);
  const [optBusy, setOptBusy] = useState(false);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      getAdsPopulation(rangeDays).catch(() => null),
      getAdsBenchmarks("30d").catch(() => ({ benchmarks: [] })),
      getOptimizationLog(30).catch(() => ({ logs: [] })),
    ])
      .then(([pop, bench, logs]) => {
        setPopulation(pop);
        setBenchmarks(bench?.benchmarks || []);
        setOptLogs(logs?.logs || []);
      })
      .finally(() => setLoading(false));
  }, [rangeDays]);

  if (loading) return <p className="text-slate-500">กำลังโหลด...</p>;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-2 items-center">
        <span className="text-sm text-slate-600">ช่วง engagement:</span>
        {([7, 30] as const).map((d) => (
          <button
            key={d}
            type="button"
            onClick={() => setRangeDays(d)}
            className={`px-3 py-1 rounded-full text-xs font-medium ${
              rangeDays === d ? "bg-indigo-600 text-white" : "bg-slate-100 text-slate-600"
            }`}
          >
            {d} วัน
          </button>
        ))}
      </div>

      {population ? (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <div className="bg-white rounded-xl border p-4 shadow-sm">
            <p className="text-xs text-slate-500">ผู้ใช้ทั้งหมด</p>
            <p className="text-2xl font-bold">{population.totalUsers.toLocaleString()}</p>
          </div>
          <div className="bg-white rounded-xl border p-4 shadow-sm">
            <p className="text-xs text-slate-500">DAU ad-eligible (24h)</p>
            <p className="text-2xl font-bold text-teal-700">
              {(population.adEligibleDau ?? 0).toLocaleString()}
            </p>
            <p className="text-xs text-slate-400">ผู้ใช้ active ที่เห็น ads ได้</p>
          </div>
          <div className="bg-white rounded-xl border p-4 shadow-sm">
            <p className="text-xs text-slate-500">คลิก ads ({rangeDays}d)</p>
            <p className="text-2xl font-bold text-violet-700">
              {population.engagedUsers.toLocaleString()}
            </p>
            <p className="text-xs text-slate-400">{population.engagementRatePct}% ของผู้ใช้</p>
          </div>
          <div className="bg-white rounded-xl border p-4 shadow-sm">
            <p className="text-xs text-slate-500">Dispute เปิดอยู่</p>
            <p className="text-2xl font-bold text-amber-700">{population.openDisputes}</p>
          </div>
          <div className="bg-white rounded-xl border p-4 shadow-sm">
            <p className="text-xs text-slate-500">Outcome ตามสถานะ</p>
            <ul className="text-xs mt-1 space-y-0.5">
              {(population.outcomesByStatus || []).map((s) => (
                <li key={s.status}>
                  {s.status}: {s.cnt}
                </li>
              ))}
            </ul>
          </div>
        </div>
      ) : null}

      <div className="grid md:grid-cols-2 gap-6">
        {population && population.usersByProvince.length > 0 ? (
          <div className="bg-white rounded-xl border overflow-hidden shadow-sm">
            <div className="px-4 py-3 border-b bg-slate-50 font-semibold text-sm">
              ผู้ใช้ตามจังหวัด (Top 15)
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-slate-500 border-b">
                  <th className="p-3">จังหวัด</th>
                  <th className="p-3">ผู้ใช้</th>
                </tr>
              </thead>
              <tbody>
                {population.usersByProvince.map((r) => (
                  <tr key={r.province} className="border-b border-slate-50">
                    <td className="p-3">{r.province}</td>
                    <td className="p-3 font-medium">{r.users.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}

        {population && population.engagementByProvince.length > 0 ? (
          <div className="bg-white rounded-xl border overflow-hidden shadow-sm">
            <div className="px-4 py-3 border-b bg-slate-50 font-semibold text-sm">
              Ad engagement ตามจังหวัด ({rangeDays}d)
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-slate-500 border-b">
                  <th className="p-3">จังหวัด</th>
                  <th className="p-3">คลิก</th>
                  <th className="p-3">% engage</th>
                </tr>
              </thead>
              <tbody>
                {population.engagementByProvince.map((r) => (
                  <tr key={r.province} className="border-b border-slate-50">
                    <td className="p-3">{r.province}</td>
                    <td className="p-3">{r.clicks}</td>
                    <td className="p-3">{r.engagementPct}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}

        {population && population.fillRateByProvince.length > 0 ? (
          <div className="bg-white rounded-xl border overflow-hidden shadow-sm md:col-span-2">
            <div className="px-4 py-3 border-b bg-teal-50 font-semibold text-sm text-teal-900">
              Fill rate ต่อจังหวัด ({rangeDays}d) — impressions / DAU ad-eligible
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-slate-500 border-b">
                  <th className="p-3">จังหวัด</th>
                  <th className="p-3">DAU eligible</th>
                  <th className="p-3">Impressions</th>
                  <th className="p-3">Fill %</th>
                </tr>
              </thead>
              <tbody>
                {population.fillRateByProvince.map((r) => (
                  <tr key={r.province} className="border-b border-slate-50">
                    <td className="p-3">{r.province}</td>
                    <td className="p-3">{r.adEligibleDau.toLocaleString()}</td>
                    <td className="p-3">{r.impressions.toLocaleString()}</td>
                    <td className="p-3 font-medium">{r.fillRatePct}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </div>

      {population && population.clicksBySurface.length > 0 ? (
        <div className="bg-white rounded-xl border overflow-hidden shadow-sm">
          <div className="px-4 py-3 border-b bg-slate-50 font-semibold text-sm">
            คลิกตาม Surface ({rangeDays}d)
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-slate-500 border-b">
                <th className="p-3">Surface</th>
                <th className="p-3">คลิก</th>
                <th className="p-3">ผู้คลิก (unique)</th>
              </tr>
            </thead>
            <tbody>
              {population.clicksBySurface.map((r) => (
                <tr key={r.surface} className="border-b border-slate-50">
                  <td className="p-3 font-mono text-xs">{r.surface}</td>
                  <td className="p-3">{r.clicks}</td>
                  <td className="p-3">{r.clickers}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      <div className="bg-white rounded-xl border overflow-hidden shadow-sm">
        <div className="px-4 py-3 border-b bg-indigo-50 font-semibold text-sm text-indigo-900">
          Platform benchmarks (median CTR / CVR ต่อ objective, 30d)
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-slate-500 border-b bg-slate-50">
              <th className="p-3">Objective</th>
              <th className="p-3">Median CTR</th>
              <th className="p-3">Median CVR</th>
              <th className="p-3">Sample</th>
            </tr>
          </thead>
          <tbody>
            {benchmarks.length === 0 ? (
              <tr>
                <td colSpan={4} className="p-6 text-center text-slate-400">
                  ยังไม่มีข้อมูล benchmark
                </td>
              </tr>
            ) : (
              benchmarks.map((b) => (
                <tr key={b.objective} className="border-b border-slate-50">
                  <td className="p-3">{OBJECTIVE_LABELS[b.objective] || b.objective}</td>
                  <td className="p-3">{b.medianCtr}%</td>
                  <td className="p-3">{b.medianCvr}%</td>
                  <td className="p-3 text-slate-500">{b.sampleSize} campaigns</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="bg-white rounded-xl border overflow-hidden shadow-sm">
        <div className="px-4 py-3 border-b bg-violet-50 flex flex-wrap items-center justify-between gap-2">
          <span className="font-semibold text-sm text-violet-900">Optimization engine (Phase F)</span>
          <button
            type="button"
            disabled={optBusy}
            onClick={async () => {
              setOptBusy(true);
              try {
                const out = await runAdsOptimization(false);
                alert(`Processed ${out.processed} · warned ${out.warned} · paused ${out.paused}`);
                const logs = await getOptimizationLog(30);
                setOptLogs(logs.logs || []);
              } catch (e) {
                alert((e as Error).message || "run failed");
              } finally {
                setOptBusy(false);
              }
            }}
            className="text-xs px-3 py-1.5 rounded-lg bg-violet-600 text-white disabled:opacity-50"
          >
            {optBusy ? "Running..." : "Run optimization batch"}
          </button>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-slate-500 border-b bg-slate-50">
              <th className="p-3">เวลา</th>
              <th className="p-3">Campaign</th>
              <th className="p-3">Action</th>
              <th className="p-3">Reason</th>
            </tr>
          </thead>
          <tbody>
            {optLogs.length === 0 ? (
              <tr>
                <td colSpan={4} className="p-6 text-center text-slate-400">
                  ยังไม่มี optimization log
                </td>
              </tr>
            ) : (
              optLogs.map((l) => (
                <tr key={l.id} className="border-b border-slate-50">
                  <td className="p-3 text-xs">{new Date(l.created_at).toLocaleString()}</td>
                  <td className="p-3 font-mono text-xs">{l.campaign_id.slice(0, 8)}…</td>
                  <td className="p-3">{l.action}</td>
                  <td className="p-3 text-xs text-slate-600">{l.reason || "—"}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
