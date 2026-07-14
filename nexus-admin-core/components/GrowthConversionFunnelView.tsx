import React, { useCallback, useEffect, useState } from "react";
import { RefreshCw, TrendingUp, Users, Sparkles, Store, Loader2 } from "lucide-react";
import { getGrowthConversionFunnel, type GrowthConversionFunnel } from "../services/adminApi";

function FunnelBar({
  label,
  value,
  max,
  color = "bg-violet-500",
}: {
  label: string;
  value: number;
  max: number;
  color?: string;
}) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-sm">
        <span className="text-slate-600">{label}</span>
        <span className="font-semibold tabular-nums">{value.toLocaleString()}</span>
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

export const GrowthConversionFunnelView: React.FC = () => {
  const [range, setRange] = useState<"7" | "30" | "90">("30");
  const [data, setData] = useState<GrowthConversionFunnel | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const funnel = await getGrowthConversionFunnel(parseInt(range, 10));
      setData(funnel);
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

  const talent = data?.talent;
  const consumer = data?.consumer;
  const merchant = data?.merchant;
  const revenue = data?.revenue799;

  return (
    <div className="space-y-6 p-1">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
            <TrendingUp className="text-violet-600" size={22} />
            Growth Conversion Funnel
          </h2>
          <p className="text-sm text-slate-500 mt-1">
            Viral milestones → AQOND Pass → Pro 799 (Talent + Merchant)
          </p>
        </div>
        <div className="flex items-center gap-2">
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
          กำลังโหลด funnel…
        </div>
      ) : error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-red-800 text-sm">{error}</div>
      ) : data ? (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard
              title="รายได้ Pro 799 (ช่วงที่เลือก)"
              value={`฿${(revenue?.totalThb ?? 0).toLocaleString()}`}
              sub={`Talent ${revenue?.talentActive ?? 0} · Merchant ${revenue?.merchantActive ?? 0} active`}
              icon={Sparkles}
            />
            <StatCard
              title="Talent Pro 799"
              value={talent?.subscribed799 ?? 0}
              sub={`${talent?.conversionTo799Pct ?? 0}% จาก video users`}
              icon={Users}
            />
            <StatCard
              title="AQOND Pass ใช้งาน"
              value={consumer?.aqondPassActive ?? 0}
              sub={`Mystery claimed ${consumer?.mysteryClaimed ?? 0}`}
              icon={TrendingUp}
            />
            <StatCard
              title="Merchant Pro 799"
              value={merchant?.subscribed799 ?? 0}
              sub={`${merchant?.conversionFromPassPct ?? 0}% จาก Pass active`}
              icon={Store}
            />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <section className="bg-white rounded-xl border border-slate-100 p-5 shadow-sm">
              <h3 className="font-bold text-slate-900 mb-4">Talent Funnel</h3>
              <div className="space-y-4">
                <FunnelBar
                  label="มี Growth entitlements"
                  value={talent?.registered ?? 0}
                  max={talent?.registered ?? 1}
                  color="bg-slate-400"
                />
                <FunnelBar
                  label="ปลดล็อก 10/10 (talent_ai)"
                  value={talent?.milestone10Unlocked ?? 0}
                  max={talent?.registered ?? 1}
                  color="bg-indigo-500"
                />
                <FunnelBar
                  label="สร้าง AI Video แล้ว"
                  value={talent?.aiVideoUsers ?? 0}
                  max={talent?.milestone10Unlocked ?? talent?.registered ?? 1}
                  color="bg-violet-500"
                />
                <FunnelBar
                  label="สมัคร Pro 799 (Talent)"
                  value={talent?.subscribed799 ?? 0}
                  max={talent?.aiVideoUsers ?? 1}
                  color="bg-emerald-500"
                />
              </div>
              <p className="text-xs text-slate-500 mt-4">
                Video jobs ในช่วง: {talent?.videoJobsInRange ?? 0} · Checkout attempts:{" "}
                {talent?.checkoutAttempts ?? 0}
              </p>
            </section>

            <section className="bg-white rounded-xl border border-slate-100 p-5 shadow-sm">
              <h3 className="font-bold text-slate-900 mb-4">Consumer + Merchant Funnel</h3>
              <div className="space-y-4">
                <FunnelBar
                  label="Mystery Box unlocked"
                  value={consumer?.mysteryUnlocked ?? 0}
                  max={consumer?.mysteryMilestone10 ?? consumer?.mysteryUnlocked ?? 1}
                  color="bg-amber-500"
                />
                <FunnelBar
                  label="Claim voucher แล้ว"
                  value={consumer?.mysteryClaimed ?? 0}
                  max={consumer?.mysteryUnlocked ?? 1}
                  color="bg-orange-500"
                />
                <FunnelBar
                  label="AQOND Pass active"
                  value={consumer?.aqondPassActive ?? 0}
                  max={consumer?.mysteryClaimed ?? consumer?.mysteryUnlocked ?? 1}
                  color="bg-cyan-500"
                />
                <FunnelBar
                  label="Merchant Pro 799"
                  value={merchant?.subscribed799 ?? 0}
                  max={consumer?.aqondPassActive ?? 1}
                  color="bg-teal-500"
                />
              </div>
              <p className="text-xs text-slate-500 mt-4">
                Merchant checkout attempts: {merchant?.checkoutAttempts ?? 0}
              </p>
            </section>
          </div>
        </>
      ) : null}
    </div>
  );
};

export default GrowthConversionFunnelView;
