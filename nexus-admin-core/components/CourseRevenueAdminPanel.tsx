/**
 * Course Marketplace — admin revenue ledger (orders, platform fee, instructor net)
 */
import React, { useCallback, useEffect, useState } from "react";
import {
  Banknote,
  Copy,
  GraduationCap,
  Loader2,
  RefreshCw,
  Search,
  TrendingUp,
  User,
} from "lucide-react";
import {
  getCourseRevenueOrders,
  getCourseRevenueSummary,
  releaseCoursePayouts,
  updateCourseRevenuePolicy,
  type AdminCourseOrderRow,
  type CourseRevenueSummaryResponse,
} from "../services/adminApi";
import { useToast } from "../context/ToastContext";

function money(value: unknown) {
  return `฿${Number(value || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatDate(value?: string) {
  if (!value) return "—";
  try {
    return new Intl.DateTimeFormat("th-TH", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
  } catch {
    return value;
  }
}

function shortId(value?: string | null, len = 8) {
  if (!value) return "—";
  return `${value.slice(0, len)}…`;
}

function statusBadge(status: string) {
  const map: Record<string, string> = {
    completed: "bg-emerald-50 text-emerald-800",
    refunded: "bg-rose-50 text-rose-800",
    pending: "bg-amber-50 text-amber-800",
  };
  return map[status] || "bg-slate-100 text-slate-700";
}

async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export const CourseRevenueAdminPanel: React.FC = () => {
  const toast = useToast();
  const [summary, setSummary] = useState<CourseRevenueSummaryResponse | null>(null);
  const [orders, setOrders] = useState<AdminCourseOrderRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [releasing, setReleasing] = useState(false);
  const [offset, setOffset] = useState(0);
  const limit = 30;

  const [statusFilter, setStatusFilter] = useState("");
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [instructorFilter, setInstructorFilter] = useState("");
  const [buyerFilter, setBuyerFilter] = useState("");
  const [courseFilter, setCourseFilter] = useState("");
  const [policySaving, setPolicySaving] = useState(false);
  const [policyDraft, setPolicyDraft] = useState({
    platformRate: "",
    coachDirectDiscountRate: "",
    coachDirectPlatformRate: "",
  });

  const loadSummary = useCallback(async () => {
    try {
      setSummary(await getCourseRevenueSummary());
    } catch (e: any) {
      toast.error(e?.message || "โหลดสรุปรายได้คอร์สไม่สำเร็จ");
      setSummary(null);
    }
  }, [toast]);

  const loadOrders = useCallback(async () => {
    setOrdersLoading(true);
    try {
      const res = await getCourseRevenueOrders({
        limit,
        offset,
        status: statusFilter || undefined,
        q: search || undefined,
        instructorId: instructorFilter || undefined,
        buyerId: buyerFilter || undefined,
        courseId: courseFilter || undefined,
      });
      setOrders(res.orders || []);
      setTotal(res.total || 0);
    } catch (e: any) {
      toast.error(e?.message || "โหลดรายการ order ไม่สำเร็จ");
      setOrders([]);
      setTotal(0);
    } finally {
      setOrdersLoading(false);
      setLoading(false);
    }
  }, [offset, statusFilter, search, instructorFilter, buyerFilter, courseFilter, toast]);

  const refreshAll = useCallback(async () => {
    setLoading(true);
    await Promise.all([loadSummary(), loadOrders()]);
  }, [loadSummary, loadOrders]);

  useEffect(() => {
    void loadSummary();
  }, [loadSummary]);

  useEffect(() => {
    if (!summary?.policy) return;
    setPolicyDraft({
      platformRate: String(summary.policy.platformRate ?? ""),
      coachDirectDiscountRate: String(summary.policy.coachDirectDiscountRate ?? ""),
      coachDirectPlatformRate: String(summary.policy.coachDirectPlatformRate ?? ""),
    });
  }, [summary?.policy]);

  useEffect(() => {
    void loadOrders();
  }, [loadOrders]);

  const handleReleasePayouts = async () => {
    setReleasing(true);
    try {
      const res = await releaseCoursePayouts(50);
      toast.success(`ปล่อย payout แล้ว ${res.count || 0} รายการ`);
      await refreshAll();
    } catch (e: any) {
      toast.error(e?.message || "ปล่อย payout ไม่สำเร็จ");
    } finally {
      setReleasing(false);
    }
  };

  const applySearch = () => {
    setOffset(0);
    setSearch(searchInput.trim());
  };

  const clearFilters = () => {
    setStatusFilter("");
    setSearch("");
    setSearchInput("");
    setInstructorFilter("");
    setBuyerFilter("");
    setCourseFilter("");
    setOffset(0);
  };

  const savePolicy = async () => {
    setPolicySaving(true);
    try {
      const body: Parameters<typeof updateCourseRevenuePolicy>[0] = {};
      if (policyDraft.platformRate.trim()) body.platformRate = Number(policyDraft.platformRate);
      if (policyDraft.coachDirectDiscountRate.trim()) {
        body.coachDirectDiscountRate = Number(policyDraft.coachDirectDiscountRate);
      }
      if (policyDraft.coachDirectPlatformRate.trim()) {
        body.coachDirectPlatformRate = Number(policyDraft.coachDirectPlatformRate);
      }
      await updateCourseRevenuePolicy(body);
      toast.success("อัปเดตนโยบายค่าธรรมเนียมแล้ว");
      await loadSummary();
    } catch (e: any) {
      toast.error(e?.message || "บันทึกนโยบายไม่สำเร็จ");
    } finally {
      setPolicySaving(false);
    }
  };

  const policy = summary?.policy;
  const orderStats = summary?.orders || {};

  if (loading && !summary) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="animate-spin text-emerald-600" size={32} />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-slate-900 inline-flex items-center gap-2">
            <Banknote size={22} className="text-emerald-600" /> Course Revenue
          </h2>
          <p className="text-sm text-slate-500 mt-1">
            รายได้แพลตฟอร์มจากคอร์ส · order id · course id · ผู้ซื้อ/ผู้สอน
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={refreshAll}
            className="inline-flex items-center gap-1 px-3 py-2 rounded-lg bg-slate-100 text-slate-700 text-sm font-semibold"
          >
            <RefreshCw size={14} /> รีเฟรช
          </button>
          <button
            type="button"
            disabled={releasing}
            onClick={handleReleasePayouts}
            className="inline-flex items-center gap-1 px-3 py-2 rounded-lg bg-indigo-600 text-white text-sm font-bold disabled:opacity-50"
          >
            {releasing ? <Loader2 size={14} className="animate-spin" /> : null}
            Release payouts
          </button>
        </div>
      </div>

      {policy ? (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm space-y-3">
          <p className="font-bold text-emerald-900">นโยบายค่าธรรมเนียม (course_revenue_policy)</p>
          <p className="text-emerald-800">
            Marketplace ปกติ: <strong>{policy.platformRatePct}%</strong> ของราคาขาย · Coach-direct: ส่วนลด{" "}
            {Math.round(policy.coachDirectDiscountRate * 100)}% · platform fee {policy.coachDirectPlatformRatePct}%
          </p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-1">
            <label className="text-xs text-emerald-900">
              platformRate (0–0.9)
              <input
                type="number"
                step="0.01"
                min="0"
                max="0.9"
                value={policyDraft.platformRate}
                onChange={(e) => setPolicyDraft((d) => ({ ...d, platformRate: e.target.value }))}
                className="block mt-1 w-full border rounded-lg px-2 py-1.5 text-sm bg-white"
              />
            </label>
            <label className="text-xs text-emerald-900">
              coachDirectDiscountRate
              <input
                type="number"
                step="0.01"
                min="0"
                max="1"
                value={policyDraft.coachDirectDiscountRate}
                onChange={(e) => setPolicyDraft((d) => ({ ...d, coachDirectDiscountRate: e.target.value }))}
                className="block mt-1 w-full border rounded-lg px-2 py-1.5 text-sm bg-white"
              />
            </label>
            <label className="text-xs text-emerald-900">
              coachDirectPlatformRate
              <input
                type="number"
                step="0.01"
                min="0"
                max="0.9"
                value={policyDraft.coachDirectPlatformRate}
                onChange={(e) => setPolicyDraft((d) => ({ ...d, coachDirectPlatformRate: e.target.value }))}
                className="block mt-1 w-full border rounded-lg px-2 py-1.5 text-sm bg-white"
              />
            </label>
          </div>
          <button
            type="button"
            disabled={policySaving}
            onClick={savePolicy}
            className="px-3 py-2 rounded-lg bg-emerald-700 text-white text-sm font-bold disabled:opacity-50"
          >
            {policySaving ? "กำลังบันทึก..." : "บันทึกนโยบาย"}
          </button>
        </div>
      ) : null}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="rounded-xl border bg-white p-4">
          <p className="text-xs text-slate-500">Gross (completed)</p>
          <p className="text-2xl font-black text-slate-900">{money(orderStats.gross_completed)}</p>
          <p className="text-xs text-slate-400">{Number(orderStats.completed_orders || 0).toLocaleString()} orders</p>
        </div>
        <div className="rounded-xl border bg-white p-4">
          <p className="text-xs text-slate-500">Platform fee (แพลตฟอร์ม)</p>
          <p className="text-2xl font-black text-emerald-700">{money(orderStats.platform_fee_orders)}</p>
          <p className="text-xs text-slate-400">platform_revenues: {money(summary?.platformRevenues?.platform_fee_net)}</p>
        </div>
        <div className="rounded-xl border bg-white p-4">
          <p className="text-xs text-slate-500">Instructor net</p>
          <p className="text-2xl font-black text-indigo-700">{money(orderStats.instructor_net_orders)}</p>
          <p className="text-xs text-slate-400">payout held: {Number(orderStats.payouts_held || 0).toLocaleString()}</p>
        </div>
        <div className="rounded-xl border bg-white p-4">
          <p className="text-xs text-slate-500">Refunded</p>
          <p className="text-2xl font-black text-rose-700">{Number(orderStats.refunded_orders || 0).toLocaleString()}</p>
          <p className="text-xs text-slate-400">released: {Number(orderStats.payouts_released || 0).toLocaleString()}</p>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl border bg-white p-4">
          <h3 className="font-bold inline-flex items-center gap-2 mb-3">
            <User size={16} /> Top instructors (platform fee)
          </h3>
          {(summary?.topInstructors || []).length === 0 ? (
            <p className="text-sm text-slate-500">ยังไม่มีรายการขาย</p>
          ) : (
            <div className="space-y-2">
              {(summary?.topInstructors || []).map((row) => (
                <button
                  key={row.instructorUserId}
                  type="button"
                  onClick={() => {
                    setInstructorFilter(row.instructorUserId);
                    setOffset(0);
                  }}
                  className="w-full text-left rounded-lg border border-slate-100 px-3 py-2 hover:border-emerald-200 hover:bg-emerald-50/50"
                >
                  <div className="flex justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-semibold text-slate-900 truncate">{row.instructorName}</p>
                      <p className="text-xs text-slate-500 truncate">{row.instructorEmail || row.instructorUserId}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="font-bold text-emerald-700">{money(row.platformFee)}</p>
                      <p className="text-xs text-slate-500">{row.orders} orders · net {money(row.instructorNet)}</p>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="rounded-xl border bg-white p-4">
          <h3 className="font-bold inline-flex items-center gap-2 mb-3">
            <GraduationCap size={16} /> Top courses (gross)
          </h3>
          {(summary?.topCourses || []).length === 0 ? (
            <p className="text-sm text-slate-500">ยังไม่มีรายการขาย</p>
          ) : (
            <div className="space-y-2">
              {(summary?.topCourses || []).map((row) => (
                <button
                  key={row.courseId}
                  type="button"
                  onClick={() => {
                    setCourseFilter(row.courseId);
                    setOffset(0);
                  }}
                  className="w-full text-left rounded-lg border border-slate-100 px-3 py-2 hover:border-indigo-200 hover:bg-indigo-50/50"
                >
                  <div className="flex justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-semibold text-slate-900 truncate">{row.courseTitle}</p>
                      <p className="text-xs text-slate-500 font-mono truncate">{row.courseId}</p>
                      {row.instructorName ? (
                        <p className="text-xs text-slate-400 truncate">โดย {row.instructorName}</p>
                      ) : null}
                    </div>
                    <div className="text-right shrink-0">
                      <p className="font-bold text-indigo-700">{money(row.gross)}</p>
                      <p className="text-xs text-slate-500">fee {money(row.platformFee)} · {row.orders} orders</p>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="rounded-xl border bg-white p-4 space-y-3">
        <div className="flex flex-wrap items-end gap-2">
          <div className="flex-1 min-w-[200px]">
            <label className="text-xs font-semibold text-slate-500">ค้นหา</label>
            <div className="flex gap-2 mt-1">
              <input
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && applySearch()}
                placeholder="ชื่อคอร์ส, email, order id, course id…"
                className="flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm"
              />
              <button type="button" onClick={applySearch} className="px-3 py-2 rounded-lg bg-slate-900 text-white text-sm font-bold">
                <Search size={14} />
              </button>
            </div>
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-500">สถานะ</label>
            <select
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                setOffset(0);
              }}
              className="mt-1 block rounded-lg border border-slate-200 px-3 py-2 text-sm"
            >
              <option value="">ทั้งหมด</option>
              <option value="completed">completed</option>
              <option value="refunded">refunded</option>
            </select>
          </div>
          {(instructorFilter || buyerFilter || courseFilter || search || statusFilter) ? (
            <button type="button" onClick={clearFilters} className="px-3 py-2 rounded-lg text-sm text-rose-700 bg-rose-50 font-semibold">
              ล้าง filter
            </button>
          ) : null}
        </div>

        {(instructorFilter || buyerFilter || courseFilter) ? (
          <div className="flex flex-wrap gap-2 text-xs">
            {instructorFilter ? (
              <span className="px-2 py-1 rounded-full bg-emerald-50 text-emerald-800">
                instructor: {shortId(instructorFilter, 12)}
                <button type="button" className="ml-1" onClick={() => setInstructorFilter("")}>×</button>
              </span>
            ) : null}
            {buyerFilter ? (
              <span className="px-2 py-1 rounded-full bg-sky-50 text-sky-800">
                buyer: {shortId(buyerFilter, 12)}
                <button type="button" className="ml-1" onClick={() => setBuyerFilter("")}>×</button>
              </span>
            ) : null}
            {courseFilter ? (
              <span className="px-2 py-1 rounded-full bg-indigo-50 text-indigo-800">
                course: {courseFilter}
                <button type="button" className="ml-1" onClick={() => setCourseFilter("")}>×</button>
              </span>
            ) : null}
          </div>
        ) : null}

        <div className="flex items-center justify-between text-sm text-slate-500">
          <span>
            <TrendingUp size={14} className="inline mr-1" />
            {total.toLocaleString()} รายการ
          </span>
          {ordersLoading ? <Loader2 size={16} className="animate-spin" /> : null}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[960px]">
            <thead>
              <tr className="text-left text-xs uppercase text-slate-500 border-b">
                <th className="py-2 pr-3">วันที่</th>
                <th className="py-2 pr-3">Order / Receipt</th>
                <th className="py-2 pr-3">Course</th>
                <th className="py-2 pr-3">ผู้ซื้อ</th>
                <th className="py-2 pr-3">ผู้สอน</th>
                <th className="py-2 pr-3 text-right">Gross</th>
                <th className="py-2 pr-3 text-right">Platform fee</th>
                <th className="py-2 pr-3 text-right">Instructor net</th>
                <th className="py-2">สถานะ</th>
              </tr>
            </thead>
            <tbody>
              {orders.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-8 text-center text-slate-500">
                    ไม่พบ order
                  </td>
                </tr>
              ) : (
                orders.map((row) => (
                  <tr key={row.orderId} className="border-b border-slate-100 align-top">
                    <td className="py-3 pr-3 whitespace-nowrap text-slate-600">{formatDate(row.createdAt)}</td>
                    <td className="py-3 pr-3">
                      <div className="font-mono text-xs text-slate-800">{row.receiptNo}</div>
                      <button
                        type="button"
                        title="Copy order id"
                        onClick={async () => {
                          const ok = await copyText(row.orderId);
                          if (ok) toast.success("Copied order id");
                        }}
                        className="text-[11px] text-slate-400 hover:text-slate-700 inline-flex items-center gap-0.5 mt-0.5"
                      >
                        {shortId(row.orderId, 10)} <Copy size={10} />
                      </button>
                      {row.ledgerId ? (
                        <div className="text-[10px] text-slate-400 mt-0.5">ledger: {shortId(row.ledgerId, 10)}</div>
                      ) : null}
                    </td>
                    <td className="py-3 pr-3 max-w-[180px]">
                      <p className="font-semibold text-slate-900 truncate">{row.course.title}</p>
                      <button
                        type="button"
                        onClick={() => {
                          setCourseFilter(row.course.id);
                          setOffset(0);
                        }}
                        className="text-[11px] font-mono text-indigo-600 hover:underline truncate block max-w-full text-left"
                      >
                        {row.course.id}
                      </button>
                    </td>
                    <td className="py-3 pr-3 max-w-[140px]">
                      <button
                        type="button"
                        onClick={() => {
                          setBuyerFilter(row.buyer.id);
                          setOffset(0);
                        }}
                        className="text-left hover:underline"
                      >
                        <p className="font-medium text-slate-900 truncate">{row.buyer.name}</p>
                        <p className="text-[11px] text-slate-500 truncate">{row.buyer.email || row.buyer.id}</p>
                      </button>
                    </td>
                    <td className="py-3 pr-3 max-w-[140px]">
                      <button
                        type="button"
                        onClick={() => {
                          setInstructorFilter(row.instructor.id);
                          setOffset(0);
                        }}
                        className="text-left hover:underline"
                      >
                        <p className="font-medium text-slate-900 truncate">{row.instructor.name}</p>
                        <p className="text-[11px] text-slate-500 truncate">{row.instructor.email || row.instructor.id}</p>
                      </button>
                    </td>
                    <td className="py-3 pr-3 text-right font-semibold">{money(row.grossAmount)}</td>
                    <td className="py-3 pr-3 text-right text-emerald-700 font-semibold">{money(row.platformFee)}</td>
                    <td className="py-3 pr-3 text-right text-indigo-700">{money(row.instructorNet)}</td>
                    <td className="py-3">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${statusBadge(row.status)}`}>
                        {row.status}
                      </span>
                      {row.payoutStatus ? (
                        <div className="text-[10px] text-slate-400 mt-1">payout: {row.payoutStatus}</div>
                      ) : null}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {total > limit ? (
          <div className="flex items-center justify-between pt-2">
            <button
              type="button"
              disabled={offset <= 0}
              onClick={() => setOffset((o) => Math.max(0, o - limit))}
              className="px-3 py-1.5 rounded-lg bg-slate-100 text-sm disabled:opacity-40"
            >
              ก่อนหน้า
            </button>
            <span className="text-xs text-slate-500">
              {offset + 1}–{Math.min(offset + limit, total)} / {total}
            </span>
            <button
              type="button"
              disabled={offset + limit >= total}
              onClick={() => setOffset((o) => o + limit)}
              className="px-3 py-1.5 rounded-lg bg-slate-100 text-sm disabled:opacity-40"
            >
              ถัดไป
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
};
