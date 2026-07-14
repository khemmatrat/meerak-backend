import React, { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Clock,
  RefreshCw,
  Shield,
  WalletCards,
} from "lucide-react";
import {
  getAdminCoursePayoutOrders,
  getAdminCoursePayoutSummary,
  runAdminCoursePayoutRelease,
  type AdminCoursePayoutSummary,
  type CourseOrderReceipt,
} from "../services/courseMarketplaceService";
import { useNotification } from "../context/NotificationContext";

function money(value: unknown) {
  return `฿${Number(value || 0).toLocaleString()}`;
}

type PayoutFilter = "all" | "held" | "released" | "blocked";

export default function AdminCoursePayouts() {
  const { notify } = useNotification();
  const [summary, setSummary] = useState<AdminCoursePayoutSummary | null>(null);
  const [orders, setOrders] = useState<CourseOrderReceipt[]>([]);
  const [filter, setFilter] = useState<PayoutFilter>("held");
  const [loading, setLoading] = useState(true);
  const [releasing, setReleasing] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [sum, list] = await Promise.all([
        getAdminCoursePayoutSummary(),
        getAdminCoursePayoutOrders({
          payoutStatus: filter === "all" ? undefined : filter,
          limit: 50,
          offset: 0,
        }),
      ]);
      setSummary(sum);
      setOrders(list.orders || []);
    } catch (e: any) {
      notify(e?.response?.data?.error || "โหลดข้อมูล payout ไม่สำเร็จ (ต้องเป็น admin)", "error");
    } finally {
      setLoading(false);
    }
  }, [filter, notify]);

  useEffect(() => {
    load();
  }, [load]);

  const handleReleaseAll = async () => {
    setReleasing(true);
    try {
      const result = await runAdminCoursePayoutRelease({ limit: 50 });
      notify(`Release แล้ว ${Number(result.count || 0)} รายการ`, "success");
      await load();
    } catch (e: any) {
      notify(e?.response?.data?.error || "Release ไม่สำเร็จ", "error");
    } finally {
      setReleasing(false);
    }
  };

  const handleReleaseOne = async (orderId: string) => {
    setReleasing(true);
    try {
      const result = await runAdminCoursePayoutRelease({ orderId, limit: 1 });
      notify(`Release order ${Number(result.count || 0) > 0 ? "สำเร็จ" : "ไม่มี eligible"}`, "success");
      await load();
    } catch (e: any) {
      notify(e?.response?.data?.error || "Release order ไม่สำเร็จ", "error");
    } finally {
      setReleasing(false);
    }
  };

  return (
    <div className="aqond-trust-theme course-flow-theme min-h-screen pb-24 p-4 space-y-5">
      <div className="flex items-center gap-3">
        <Link to="/reconciliation" className="p-2 rounded-xl bg-slate-800 text-slate-200">
          <ArrowLeft size={18} />
        </Link>
        <div>
          <h1 className="text-2xl font-black text-slate-100 inline-flex items-center gap-2">
            <Shield size={22} className="text-emerald-300" /> Course Payout Ops
          </h1>
          <p className="text-sm text-slate-500">Manual release · filter blocked · admin only</p>
        </div>
      </div>

      {loading && !summary ? (
        <div className="luxury-card rounded-3xl h-40 animate-pulse" />
      ) : (
        <section className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="luxury-card rounded-2xl p-4">
            <p className="text-xs text-slate-500">Held</p>
            <p className="text-xl font-black text-blue-300">{Number(summary?.held || 0)}</p>
            <p className="text-xs text-slate-500">{money(summary?.held_net)}</p>
          </div>
          <div className="luxury-card rounded-2xl p-4">
            <p className="text-xs text-slate-500">Released</p>
            <p className="text-xl font-black text-emerald-300">{Number(summary?.released || 0)}</p>
          </div>
          <div className="luxury-card rounded-2xl p-4">
            <p className="text-xs text-slate-500">Blocked</p>
            <p className="text-xl font-black text-rose-300">{Number(summary?.blocked || 0)}</p>
            <p className="text-xs text-slate-500">{money(summary?.blocked_net)}</p>
          </div>
          <button
            type="button"
            disabled={releasing}
            onClick={handleReleaseAll}
            className="luxury-card rounded-2xl p-4 text-left hover:border-emerald-400/40 border border-transparent disabled:opacity-60"
          >
            <p className="text-xs text-slate-500 inline-flex items-center gap-1">
              <WalletCards size={14} /> Release eligible
            </p>
            <p className="text-sm font-bold text-emerald-300 mt-2">{releasing ? "กำลัง release..." : "Run batch (50)"}</p>
          </button>
        </section>
      )}

      <section className="flex flex-wrap gap-2">
        {(["all", "held", "released", "blocked"] as PayoutFilter[]).map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setFilter(f)}
            className={`px-3 py-1.5 rounded-full text-xs font-bold ${
              filter === f ? "bg-emerald-600 text-white" : "bg-slate-800 text-slate-300"
            }`}
          >
            {f}
          </button>
        ))}
        <button type="button" onClick={load} className="ml-auto inline-flex items-center gap-1 text-sm text-slate-400">
          <RefreshCw size={14} /> รีเฟรช
        </button>
      </section>

      <section className="luxury-card rounded-3xl p-4 space-y-2">
        {loading ? (
          <div className="h-32 animate-pulse bg-slate-800/50 rounded-2xl" />
        ) : orders.length === 0 ? (
          <p className="text-sm text-slate-400">ไม่มี order ในตัวกรองนี้</p>
        ) : (
          orders.map((order) => (
            <div key={order.id} className="rounded-2xl bg-slate-900/70 border border-slate-700 p-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-semibold text-slate-100">{order.course.title}</p>
                  <p className="text-xs text-slate-500">
                    {order.instructor.name} · net {money(order.instructorNet)} · {order.payoutStatus || "held"}
                  </p>
                </div>
                <div className="flex flex-col items-end gap-2">
                  {order.payoutStatus === "blocked" ? (
                    <span className="text-[10px] font-bold text-rose-300 inline-flex items-center gap-1">
                      <AlertTriangle size={12} /> blocked
                    </span>
                  ) : order.payoutStatus === "released" ? (
                    <span className="text-[10px] font-bold text-emerald-300 inline-flex items-center gap-1">
                      <CheckCircle2 size={12} /> released
                    </span>
                  ) : (
                    <span className="text-[10px] font-bold text-blue-200 inline-flex items-center gap-1">
                      <Clock size={12} /> held
                    </span>
                  )}
                  {order.payoutStatus === "held" ? (
                    <button
                      type="button"
                      disabled={releasing}
                      onClick={() => handleReleaseOne(order.id)}
                      className="px-2 py-1 rounded-lg bg-emerald-600 text-white text-[10px] font-bold disabled:opacity-60"
                    >
                      Release
                    </button>
                  ) : null}
                </div>
              </div>
            </div>
          ))
        )}
      </section>
    </div>
  );
}
