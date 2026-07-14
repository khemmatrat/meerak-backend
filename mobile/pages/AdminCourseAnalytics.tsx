import React, { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, BarChart3, RefreshCw, TrendingUp } from "lucide-react";
import {
  getAdminCourseAuditLog,
  getAdminCourseFunnelReport,
  getAdminCourseRevenueReport,
  type CourseFunnelReport,
  type AdminCourseRevenueReport,
} from "../services/courseMarketplaceService";
import { useNotification } from "../context/NotificationContext";

const FUNNEL_LABELS: Record<string, string> = {
  course_impression: "Impression",
  course_detail_view: "Detail view",
  course_preview_play: "Preview play",
  course_purchase_intent: "Purchase intent",
  course_purchase_completed: "Purchased",
  course_lesson_completed: "Lesson done",
  course_review_submitted: "Review",
  course_qa_posted: "Q&A posted",
};

export default function AdminCourseAnalytics() {
  const { notify } = useNotification();
  const [funnel, setFunnel] = useState<CourseFunnelReport | null>(null);
  const [revenue, setRevenue] = useState<AdminCourseRevenueReport | null>(null);
  const [auditCount, setAuditCount] = useState(0);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [f, r, a] = await Promise.all([
        getAdminCourseFunnelReport(),
        getAdminCourseRevenueReport(),
        getAdminCourseAuditLog({ limit: 20 }),
      ]);
      setFunnel(f);
      setRevenue(r);
      setAuditCount(a.rows?.length || 0);
    } catch (e: any) {
      notify(e?.response?.data?.error || "โหลด analytics ไม่สำเร็จ (ต้องเป็น admin)", "error");
    } finally {
      setLoading(false);
    }
  }, [notify]);

  useEffect(() => {
    load();
  }, [load]);

  const orders = revenue?.orders;

  return (
    <div className="min-h-screen bg-gray-50 p-4 md:p-6 pb-24">
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex items-center gap-3">
          <Link to="/reconciliation" className="p-2 rounded-lg bg-white border border-gray-200">
            <ArrowLeft size={18} />
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-gray-900 inline-flex items-center gap-2">
              <BarChart3 size={24} className="text-indigo-600" /> Course Analytics
            </h1>
            <p className="text-sm text-gray-500">Funnel conversion + ยอดขาย platform fee</p>
          </div>
          <button type="button" onClick={load} className="ml-auto px-3 py-2 rounded-lg border bg-white text-sm inline-flex items-center gap-1">
            <RefreshCw size={14} className={loading ? "animate-spin" : ""} /> รีเฟรช
          </button>
        </div>

        {loading ? <p className="text-gray-500">กำลังโหลด...</p> : null}

        {revenue ? (
          <section className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="rounded-2xl bg-white border p-4">
              <p className="text-xs text-gray-500">Orders สำเร็จ</p>
              <p className="text-2xl font-black text-gray-900">{orders?.completed_orders ?? 0}</p>
            </div>
            <div className="rounded-2xl bg-white border p-4">
              <p className="text-xs text-gray-500">Gross</p>
              <p className="text-2xl font-black text-emerald-700">฿{Number(orders?.gross_completed || 0).toLocaleString()}</p>
            </div>
            <div className="rounded-2xl bg-white border p-4">
              <p className="text-xs text-gray-500">Platform fee</p>
              <p className="text-2xl font-black text-indigo-700">฿{Number(orders?.platform_fee_orders || 0).toLocaleString()}</p>
            </div>
            <div className="rounded-2xl bg-white border p-4">
              <p className="text-xs text-gray-500">Platform rate</p>
              <p className="text-2xl font-black text-gray-900">{revenue.policy?.platformRatePct ?? 35}%</p>
            </div>
          </section>
        ) : null}

        {funnel ? (
          <section className="rounded-2xl bg-white border p-5 space-y-4">
            <h2 className="font-bold text-gray-900 inline-flex items-center gap-2">
              <TrendingUp size={18} /> Conversion funnel
            </h2>
            <div className="space-y-2">
              {Object.entries(funnel.funnel || {}).map(([key, count]) => (
                <div key={key} className="flex items-center justify-between text-sm border-b border-gray-100 pb-2">
                  <span className="text-gray-700">{FUNNEL_LABELS[key] || key}</span>
                  <span className="font-bold text-gray-900">{count}</span>
                </div>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs text-gray-600">
              <div>Detail rate: {funnel.conversion?.detail_rate ?? "—"}%</div>
              <div>Purchase rate: {funnel.conversion?.purchase_rate ?? "—"}%</div>
              <div>Preview rate: {funnel.conversion?.preview_rate ?? "—"}%</div>
              <div>Review rate: {funnel.conversion?.review_rate ?? "—"}%</div>
            </div>
          </section>
        ) : null}

        <section className="rounded-2xl bg-white border p-5">
          <h2 className="font-bold text-gray-900 mb-2">Audit log (ล่าสุด {auditCount} รายการ)</h2>
          <Link to="/reconciliation/course-review" className="text-sm font-semibold text-emerald-700">
            ไปคิวตรวจคอร์ส →
          </Link>
        </section>
      </div>
    </div>
  );
}
