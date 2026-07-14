import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { BarChart3, BookOpen, ReceiptText, TrendingUp, WalletCards } from "lucide-react";
import CourseFlowHeader from "../components/courseMarketplace/CourseFlowHeader";
import {
  getInstructorSalesDashboard,
  type CourseOrderReceipt,
  type InstructorSalesDashboard,
} from "../services/courseMarketplaceService";

function money(value: unknown) {
  return `฿${Number(value || 0).toLocaleString()}`;
}

function formatDate(value?: string) {
  if (!value) return "-";
  try {
    return new Intl.DateTimeFormat("th-TH", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
  } catch {
    return value;
  }
}

function payoutBadge(order: CourseOrderReceipt) {
  const status = order.payoutStatus || "held";
  if (order.status === "refunded" || order.refundStatus === "refunded") {
    return { label: "คืนเงินแล้ว", className: "text-amber-300 bg-amber-500/15 border-amber-400/30" };
  }
  if (status === "released") {
    return { label: "ปล่อยรายได้แล้ว", className: "text-emerald-300 bg-emerald-500/15 border-emerald-400/30" };
  }
  if (status === "blocked") {
    return { label: "รายได้ถูก block", className: "text-rose-300 bg-rose-500/15 border-rose-400/30" };
  }
  const releaseAt = order.payoutReleaseAt ? formatDate(order.payoutReleaseAt) : null;
  return {
    label: releaseAt ? `รอ release · ${releaseAt}` : "รอ release payout",
    className: "text-blue-200 bg-blue-500/15 border-blue-400/30",
  };
}

export default function InstructorCourseSales() {
  const [dashboard, setDashboard] = useState<InstructorSalesDashboard | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      try {
        const data = await getInstructorSalesDashboard();
        if (alive) setDashboard(data);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const summary = dashboard?.summary || {};
  const wallet = dashboard?.wallet;
  const forecast = dashboard?.forecast;
  const recent = dashboard?.recent || [];
  const topCourses = dashboard?.topCourses || [];

  const forecastLine = (() => {
    if (!forecast) return null;
    const parts: string[] = [];
    if (Number(forecast.releasableNowNet || 0) > 0) {
      parts.push(`พร้อม release ทันที ${money(forecast.releasableNowNet)}`);
    }
    const nextAt = forecast.nextFutureReleaseAt || forecast.nextReleaseAt;
    if (nextAt) {
      parts.push(`รอบถัดไป ${formatDate(nextAt)}${Number(forecast.heldUntilFutureNet || 0) > 0 ? ` · ${money(forecast.heldUntilFutureNet)}` : ""}`);
    }
    return parts.length ? parts.join(" · ") : "ยังไม่มีรายได้รอ release";
  })();

  return (
    <div className="aqond-trust-theme course-flow-theme min-h-screen pb-24 space-y-5">
      <CourseFlowHeader title="Sales Dashboard" backTo="/course-studio" backLabel="Course Studio" />
      <section className="course-flow-hero rounded-[32px] p-6 bg-gradient-to-br from-indigo-600 via-slate-950 to-emerald-700 text-white">
        <div className="flex items-start gap-4">
          <div className="p-3 rounded-2xl bg-white/15">
            <BarChart3 size={34} />
          </div>
          <div>
            <p className="text-sm opacity-80">Instructor Sales Dashboard</p>
            <h1 className="text-3xl font-black leading-tight">ยอดขายคอร์สของคุณ</h1>
            <p className="text-sm opacity-90 mt-1">แยก gross, platform fee และรายได้สุทธิผู้สอนจาก order จริง</p>
            {forecastLine ? (
              <p className="text-xs opacity-85 mt-2 inline-flex items-center gap-1 bg-white/10 rounded-xl px-3 py-1.5">
                <WalletCards size={14} /> {forecastLine}
              </p>
            ) : null}
          </div>
        </div>
      </section>

      {loading ? (
        <div className="luxury-card rounded-3xl h-60 animate-pulse" />
      ) : (
        <>
          <section className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <div className="luxury-card rounded-3xl p-4">
              <p className="text-xs text-slate-500">Orders</p>
              <p className="text-2xl font-black text-slate-100">{Number(summary.orders || 0).toLocaleString()}</p>
            </div>
            <div className="luxury-card rounded-3xl p-4">
              <p className="text-xs text-slate-500">Gross วันนี้</p>
              <p className="text-2xl font-black text-emerald-300">{money(summary.gross_today)}</p>
            </div>
            <div className="luxury-card rounded-3xl p-4">
              <p className="text-xs text-slate-500">ค่าธรรมเนียมแพลตฟอร์ม</p>
              <p className="text-2xl font-black text-slate-300">{money(summary.platform_fee)}</p>
            </div>
            <div className="luxury-card rounded-3xl p-4">
              <p className="text-xs text-slate-500">รายได้สุทธิเดือนนี้</p>
              <p className="text-2xl font-black text-blue-300">{money(summary.instructor_net_month)}</p>
            </div>
            <div className="luxury-card rounded-3xl p-4 col-span-2 md:col-span-1">
              <p className="text-xs text-slate-500">รอ release payout</p>
              <p className="text-2xl font-black text-amber-300">{money(summary.pending_net)}</p>
              <p className="text-xs text-slate-500 mt-1">{Number(summary.payouts_pending || 0).toLocaleString()} รายการ · ปล่อยแล้ว {Number(summary.payouts_released || 0).toLocaleString()}</p>
            </div>
          </section>

          {wallet ? (
            <section className="luxury-card rounded-3xl p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div>
                <p className="text-xs text-slate-500 inline-flex items-center gap-1">
                  <WalletCards size={14} /> Wallet ผู้สอน
                </p>
                <p className="text-2xl font-black text-emerald-300 mt-1">{money(wallet.withdrawable)}</p>
                <p className="text-xs text-slate-500 mt-1">
                  รอ release ใน wallet {money(wallet.pending)} · ยอดรวม {money(wallet.balance)}
                </p>
              </div>
              <Link
                to="/profile?tab=wallet"
                className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-2xl bg-emerald-600 text-white font-bold text-sm shrink-0"
              >
                ถอนเงินเข้าบัญชี
              </Link>
            </section>
          ) : null}

          <section className="luxury-card rounded-3xl p-4">
            <div className="flex items-center justify-between gap-3 mb-3">
              <h2 className="font-bold text-slate-100 inline-flex items-center gap-2">
                <TrendingUp size={18} /> คอร์สที่ขายดีที่สุด
              </h2>
              <Link to="/course-studio" className="text-sm text-emerald-300 font-semibold">กลับ Studio</Link>
            </div>
            {topCourses.length === 0 ? (
              <p className="text-sm text-slate-400">ยังไม่มี order คอร์ส เมื่อขายได้จะเห็นอันดับคอร์สที่ทำรายได้ที่นี่</p>
            ) : (
              <div className="space-y-2">
                {topCourses.map((course) => (
                  <div key={String(course.course_id)} className="rounded-2xl bg-slate-900/70 border border-slate-700 p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-semibold text-slate-100 inline-flex items-center gap-2">
                          <BookOpen size={16} className="text-emerald-300" /> {String(course.title || "Course")}
                        </p>
                        <p className="text-xs text-slate-500">{Number(course.orders || 0).toLocaleString()} orders</p>
                      </div>
                      <div className="text-right">
                        <p className="text-emerald-300 font-bold">{money(course.instructor_net)}</p>
                        <p className="text-xs text-slate-500">net</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="luxury-card rounded-3xl p-4">
            <h2 className="font-bold text-slate-100 inline-flex items-center gap-2 mb-3">
              <ReceiptText size={18} /> Recent orders & seller receipts
            </h2>
            {recent.length === 0 ? (
              <div className="rounded-2xl bg-slate-900/70 p-4 text-sm text-slate-400">
                ยังไม่มีรายการขาย ลองเพิ่ม preview lesson, thumbnail และประกาศคอร์สหน้า Home เพื่อเพิ่ม conversion
              </div>
            ) : (
              <div className="space-y-2">
                {recent.map((order) => {
                  const badge = payoutBadge(order);
                  return (
                  <Link
                    key={order.id}
                    to={`/courses/orders/${order.id}/receipt`}
                    className="block rounded-2xl bg-slate-900/70 border border-slate-700 p-3 hover:border-emerald-400/40 transition-colors"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-semibold text-slate-100">{order.course.title}</p>
                        <p className="text-xs text-slate-500">{formatDate(order.createdAt)} · {order.buyer.name}</p>
                        <span className={`inline-flex mt-2 px-2 py-0.5 rounded-full text-[10px] font-semibold border ${badge.className}`}>
                          {badge.label}
                        </span>
                      </div>
                      <div className="text-right">
                        <p className="text-emerald-300 font-bold">{money(order.instructorNet)}</p>
                        <p className="text-xs text-slate-500">net · fee {money(order.platformFee)}</p>
                      </div>
                    </div>
                  </Link>
                  );
                })}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
