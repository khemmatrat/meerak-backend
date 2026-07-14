import React, { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { BookOpen, ReceiptText, RefreshCw } from "lucide-react";
import {
  getMyCourseOrders,
  type CourseOrderReceipt,
} from "../../services/courseMarketplaceService";

function money(value?: number) {
  return `฿${Number(value || 0).toLocaleString()}`;
}

function formatDate(value?: string) {
  if (!value) return "-";
  try {
    return new Intl.DateTimeFormat("th-TH", { dateStyle: "medium" }).format(new Date(value));
  } catch {
    return value;
  }
}

function statusLabel(order: CourseOrderReceipt) {
  if (order.status === "refunded" || order.refundStatus === "refunded") return "คืนเงินแล้ว";
  return "ซื้อแล้ว";
}

export default function CoursePurchasesTab() {
  const navigate = useNavigate();
  const [orders, setOrders] = useState<CourseOrderReceipt[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const data = await getMyCourseOrders({ limit: 30, offset: 0 });
      setOrders(data.orders || []);
      setTotal(data.total || 0);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  if (loading) {
    return <div className="luxury-card rounded-3xl h-48 animate-pulse" />;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-slate-100 inline-flex items-center gap-2">
            <BookOpen size={20} className="text-emerald-300" /> คอร์สที่ซื้อ
          </h2>
          <p className="text-sm text-slate-500 mt-1">{total.toLocaleString()} รายการ · ใบเสร็จและคืนเงินดูได้จากแต่ละ order</p>
        </div>
        <button
          type="button"
          onClick={load}
          className="inline-flex items-center gap-1 px-3 py-2 rounded-xl bg-slate-800 text-slate-200 text-sm font-semibold"
        >
          <RefreshCw size={14} /> รีเฟรช
        </button>
      </div>

      {orders.length === 0 ? (
        <div className="luxury-card rounded-3xl p-6 text-center space-y-3">
          <BookOpen className="mx-auto text-slate-500" size={32} />
          <p className="text-slate-300 font-semibold">ยังไม่มีคอร์สที่ซื้อ</p>
          <Link to="/courses" className="inline-flex px-4 py-2 rounded-xl bg-emerald-600 text-white font-bold text-sm">
            ไปตลาดคอร์ส
          </Link>
        </div>
      ) : (
        <div className="space-y-2">
          {orders.map((order) => (
            <Link
              key={order.id}
              to={`/courses/orders/${order.id}/receipt`}
              className="luxury-card rounded-2xl p-4 block hover:border-emerald-400/30 border border-transparent transition-colors"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-semibold text-slate-100">{order.course.title}</p>
                  <p className="text-xs text-slate-500 mt-1">
                    {formatDate(order.createdAt)} · {order.instructor.name} · {statusLabel(order)}
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-emerald-300 font-bold">{money(order.grossAmount)}</p>
                  <p className="text-xs text-slate-500 inline-flex items-center gap-1 mt-1">
                    <ReceiptText size={12} /> ใบเสร็จ
                  </p>
                </div>
              </div>
              {order.status !== "refunded" ? (
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    navigate(`/courses/${order.course.id}/learn`);
                  }}
                  className="inline-flex mt-3 px-3 py-1.5 rounded-lg bg-emerald-600/20 text-emerald-200 text-xs font-bold"
                >
                  ไปเรียนต่อ
                </button>
              ) : null}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
