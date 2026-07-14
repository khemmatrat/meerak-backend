import React, { useCallback, useEffect, useState } from "react";
import {
  BarChart3,
  Loader2,
  RefreshCw,
  Sparkles,
  Users,
  UserCheck,
  Compass,
  Bot,
} from "lucide-react";
import { getFtxDashboard, type FtxDashboard } from "../services/adminApi";

function FunnelBar({
  label,
  actors,
  max,
  color = "bg-amber-500",
}: {
  label: string;
  actors: number;
  max: number;
  color?: string;
}) {
  const pct = max > 0 ? Math.min(100, Math.round((actors / max) * 100)) : 0;
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-sm">
        <span className="text-slate-600">{label}</span>
        <span className="font-semibold tabular-nums">{actors.toLocaleString()}</span>
      </div>
      <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function StatCard({
  title,
  value,
  sub,
  icon: Icon,
}: {
  title: string;
  value: string | number;
  sub?: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
}) {
  return (
    <div className="bg-white rounded-xl p-5 shadow-sm border border-slate-100">
      <div className="flex items-center gap-2 text-slate-500 text-sm mb-2">
        <Icon size={16} />
        {title}
      </div>
      <p className="text-2xl font-bold text-slate-900 tabular-nums">{value}</p>
      {sub ? <p className="text-xs text-slate-500 mt-1">{sub}</p> : null}
    </div>
  );
}

function intentLabel(intent: string): string {
  const map: Record<string, string> = {
    food_order: "สั่งอาหาร",
    food_merchant: "ร้านอาหาร",
    marketplace_seller: "ขาย Marketplace",
    rider: "ไรเดอร์",
    talent: "Talent",
    videos: "วิดีโอ",
    ai_ads: "โฆษณา AI",
    resume: "เรซูเม่",
    customer: "ลูกค้า",
    other: "อื่นๆ",
  };
  return map[intent] || intent;
}

export const FtxDashboardView: React.FC = () => {
  const [range, setRange] = useState<"7" | "30" | "90">("30");
  const [data, setData] = useState<FtxDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const dash = await getFtxDashboard(parseInt(range, 10));
      setData(dash);
    } catch (e) {
      setError(e instanceof Error ? e.message : "โหลดไม่สำเร็จ");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [range]);

  useEffect(() => {
    void load();
  }, [load]);

  const funnelMax = Math.max(...(data?.funnel?.map((f) => f.actors) || [1]), 1);
  const rollout = data?.rollout;
  const summary = data?.summary;
  const guestReg = data?.guestVsRegistered;

  return (
    <div className="space-y-6 p-1">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
            <Sparkles className="text-amber-600" size={22} />
            AQOND FTX Dashboard
          </h2>
          <p className="text-sm text-slate-500 mt-1">
            First-Time Experience — welcome · wizard · tour · Jarvis · conversion funnel
          </p>
        </div>
        <div className="flex items-center gap-2">
          {rollout ? (
            <span
              className={`text-xs font-semibold px-2.5 py-1 rounded-full border ${
                rollout.killSwitch
                  ? "bg-rose-50 text-rose-700 border-rose-200"
                  : rollout.experienceEnabled
                    ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                    : "bg-slate-100 text-slate-600 border-slate-200"
              }`}
            >
              {rollout.killSwitch ? "KILL SWITCH" : rollout.experienceEnabled ? "LIVE" : "OFF"}
            </span>
          ) : null}
          <select
            value={range}
            onChange={(e) => setRange(e.target.value as "7" | "30" | "90")}
            className="border border-slate-200 rounded-lg px-3 py-2 text-sm"
          >
            <option value="7">7 วัน</option>
            <option value="30">30 วัน</option>
            <option value="90">90 วัน</option>
          </select>
          <button
            type="button"
            onClick={() => void load()}
            className="inline-flex items-center gap-1 px-3 py-2 rounded-lg border border-slate-200 text-sm hover:bg-slate-50"
          >
            <RefreshCw size={14} />
            รีเฟรช
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-slate-500 py-12 justify-center">
          <Loader2 className="animate-spin" size={20} />
          กำลังโหลด FTX analytics…
        </div>
      ) : error ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-rose-800 text-sm">
          {error}
        </div>
      ) : data ? (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard
              title="Guest sessions"
              value={(guestReg?.guests || 0).toLocaleString()}
              sub={`Registered actors: ${(guestReg?.registered || 0).toLocaleString()}`}
              icon={Users}
            />
            <StatCard
              title="Wizard completed"
              value={(summary?.wizardCompletedInRange || 0).toLocaleString()}
              sub={`All-time: ${(summary?.wizardCompleted || 0).toLocaleString()}`}
              icon={Compass}
            />
            <StatCard
              title="Tour completed"
              value={(summary?.tourCompletedInRange || 0).toLocaleString()}
              sub={`Skipped profiles: ${(summary?.tourSkippedProfiles || 0).toLocaleString()}`}
              icon={UserCheck}
            />
            <StatCard
              title="7-day retention"
              value={`${data.retention?.retentionPct ?? 0}%`}
              sub={`${data.retention?.multiDayActors ?? 0} multi-day actors`}
              icon={BarChart3}
            />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-5 space-y-4">
              <h3 className="font-bold text-slate-800 flex items-center gap-2">
                <BarChart3 size={18} className="text-amber-600" />
                Conversion funnel (unique actors)
              </h3>
              {data.funnel.map((step) => (
                <FunnelBar
                  key={step.eventType}
                  label={step.label}
                  actors={step.actors}
                  max={funnelMax}
                />
              ))}
            </div>

            <div className="space-y-6">
              <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-5">
                <h3 className="font-bold text-slate-800 mb-3">Primary interests</h3>
                {data.primaryIntents.length === 0 ? (
                  <p className="text-sm text-slate-400">ยังไม่มีข้อมูล wizard</p>
                ) : (
                  <ul className="space-y-2">
                    {data.primaryIntents.map((row) => (
                      <li key={row.intent} className="flex justify-between text-sm">
                        <span className="text-slate-600">{intentLabel(row.intent)}</span>
                        <span className="font-semibold tabular-nums">{row.n}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-5">
                <h3 className="font-bold text-slate-800 mb-3">Referral sources</h3>
                {data.referralSources.length === 0 ? (
                  <p className="text-sm text-slate-400">ยังไม่มีข้อมูลแหล่งที่มา</p>
                ) : (
                  <ul className="space-y-2">
                    {data.referralSources.map((row) => (
                      <li key={row.source} className="flex justify-between text-sm">
                        <span className="text-slate-600 capitalize">{row.source}</span>
                        <span className="font-semibold tabular-nums">{row.n}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-5">
              <h3 className="font-bold text-slate-800 mb-3 flex items-center gap-2">
                <Bot size={18} className="text-amber-600" />
                Event volume (top types)
              </h3>
              <ul className="space-y-1.5 max-h-64 overflow-y-auto text-sm">
                {data.eventCounts.map((row) => (
                  <li key={row.event_type} className="flex justify-between gap-2">
                    <code className="text-slate-600 truncate">{row.event_type}</code>
                    <span className="font-semibold tabular-nums shrink-0">{row.n}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-5">
              <h3 className="font-bold text-slate-800 mb-3">Daily events</h3>
              {data.dailyEvents.length === 0 ? (
                <p className="text-sm text-slate-400">ไม่มี events ในช่วงนี้</p>
              ) : (
                <ul className="space-y-1 max-h-64 overflow-y-auto text-sm">
                  {data.dailyEvents.map((row) => (
                    <li key={String(row.day)} className="flex justify-between">
                      <span className="text-slate-600">{String(row.day).slice(0, 10)}</span>
                      <span className="font-semibold tabular-nums">{row.n}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          <p className="text-xs text-slate-400">
            Generated {data.generatedAt ? new Date(data.generatedAt).toLocaleString("th-TH") : "—"}
            {data.stub ? " · stub (no DB)" : ""}
          </p>
        </>
      ) : null}
    </div>
  );
};

export default FtxDashboardView;
