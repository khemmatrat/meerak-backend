import React, { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ChevronRight, Loader2, Shield } from "lucide-react";
import { Layout } from "../components/Layout";
import {
  prbCta,
  prbHeading,
  prbPageBg,
  prbSectionCard,
} from "../components/prb/prbTheme";
import { fetchPrbOrderHistory, type PrbOrderSummary } from "../services/prbApi";

const STATUS_LABEL: Record<string, string> = {
  checking: "รับคำสั่งแล้ว",
  processing: "กำลังดำเนินการ",
  shipped: "จัดส่งแล้ว — รอยืนยันรับ",
  completed: "เสร็จสมบูรณ์",
  dispute: "เปิดกรณีพิพาท",
  cancelled: "ยกเลิก",
};

function statusLabel(s: string | undefined) {
  return STATUS_LABEL[String(s || "").toLowerCase()] || s || "—";
}

export function PrbTrackHub() {
  const navigate = useNavigate();
  const [orders, setOrders] = useState<PrbOrderSummary[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const list = await fetchPrbOrderHistory(30);
      setOrders(list);
    } catch {
      setOrders([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <Layout>
      <div className={`px-4 py-6 pb-24 ${prbPageBg}`}>
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="mb-3 text-sm text-blue-700"
        >
          ← กลับ
        </button>
        <h1 className={`mb-1 text-xl ${prbHeading}`}>ติดตาม พ.ร.บ.</h1>
        <p className="mb-4 text-sm text-slate-600">
          ดูสถานะคำสั่งหลังแจ้งที่อยู่จัดส่ง —
          ยืนยันรับเอกสารหรือแจ้งปัญหาได้ที่นี่
        </p>

        {loading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
          </div>
        ) : orders.length === 0 ? (
          <div className={`${prbSectionCard} text-center`}>
            <Shield className="mx-auto mb-3 h-12 w-12 text-blue-400" />
            <p className="text-slate-600">ยังไม่มีคำสั่งต่อ พ.ร.บ.</p>
            <Link to="/prb" className={`${prbCta} mt-4 inline-block`}>
              ต่อ พ.ร.บ. ด่วน
            </Link>
          </div>
        ) : (
          <div className="space-y-3">
            {orders.map((o) => (
              <Link
                key={o.id}
                to={`/prb/track/${o.id}`}
                className={`${prbSectionCard} flex items-center gap-3 transition hover:border-blue-200`}
              >
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-sky-100 text-blue-700">
                  <Shield size={22} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-bold text-blue-950">
                    {o.quote_number || o.id.slice(0, 8)}
                  </p>
                  <p className="text-sm text-slate-600">
                    {o.registration_number || "—"} · ฿
                    {Number(o.total_price || 0).toLocaleString()}
                  </p>
                  <p className="mt-0.5 text-xs font-medium text-emerald-700">
                    {statusLabel(o.status)}
                  </p>
                </div>
                <ChevronRight className="shrink-0 text-slate-400" size={20} />
              </Link>
            ))}
          </div>
        )}

        <Link
          to="/prb"
          className="mt-6 block text-center text-sm font-semibold text-blue-700"
        >
          + ต่อ พ.ร.บ. คำสั่งใหม่
        </Link>
      </div>
    </Layout>
  );
}
