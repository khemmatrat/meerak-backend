import React, { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { Layout } from "../components/Layout";
import {
  prbPageBg,
  prbSectionCard,
  prbHeading,
  prbCta,
} from "../components/prb/prbTheme";
import {
  confirmPrbOrder,
  disputePrbOrder,
  fetchPrbOrder,
} from "../services/prbApi";
import { useNotification } from "../context/NotificationContext";

const STEPS = ["checking", "processing", "shipped", "completed"] as const;

export function PrbOrderTrack() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { notify } = useNotification();
  const [order, setOrder] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);
  const [disputeReason, setDisputeReason] = useState("");
  const [busy, setBusy] = useState(false);

  const load = async () => {
    if (!id) return;
    setLoading(true);
    try {
      const o = await fetchPrbOrder(id);
      setOrder(o);
    } catch {
      notify("โหลดคำสั่งไม่สำเร็จ", "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [id]);

  if (loading) {
    return (
      <Layout>
        <div
          className={`flex min-h-[50vh] items-center justify-center ${prbPageBg}`}
        >
          <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
        </div>
      </Layout>
    );
  }

  if (!order) {
    return (
      <Layout>
        <div className={`p-6 ${prbPageBg}`}>
          <p>ไม่พบคำสั่ง</p>
          <button
            type="button"
            className="mt-4 text-blue-600"
            onClick={() => navigate("/prb")}
          >
            กลับ
          </button>
        </div>
      </Layout>
    );
  }

  const status = String(order.status || "checking");
  const stepIdx = STEPS.indexOf(status as (typeof STEPS)[number]);
  const canConfirm = status === "shipped";

  return (
    <Layout>
      <div className={`px-4 py-6 pb-24 ${prbPageBg}`}>
        <h1 className={`mb-4 text-xl ${prbHeading}`}>ติดตามสถานะ พ.ร.บ.</h1>
        <div className={prbSectionCard}>
          <p className="text-sm text-slate-500">เลขที่คำสั่ง</p>
          <p className="text-lg font-bold text-blue-900">
            {String(order.quote_number)}
          </p>
          <p className="mt-2 text-sm">
            ทะเบียน: {String(order.registration_number)} — ฿
            {Number(order.total_price).toLocaleString()}
          </p>
          <div className="mt-4 space-y-2">
            {STEPS.map((s, i) => (
              <div key={s} className="flex items-center gap-2 text-sm">
                <div
                  className={`h-3 w-3 rounded-full ${
                    i <= stepIdx ? "bg-emerald-500" : "bg-slate-200"
                  }`}
                />
                <span
                  className={i <= stepIdx ? "text-slate-800" : "text-slate-400"}
                >
                  {s === "checking" && "รับคำสั่งแล้ว"}
                  {s === "processing" && "กำลังดำเนินการ"}
                  {s === "shipped" && "จัดส่งแล้ว"}
                  {s === "completed" && "เสร็จสมบูรณ์"}
                </span>
              </div>
            ))}
          </div>
          {order.policy_pdf_url ? (
            <a
              href={String(order.policy_pdf_url)}
              target="_blank"
              rel="noreferrer"
              className="mt-4 inline-block text-sm text-blue-600 underline"
            >
              ดาวน์โหลดกรมธรรม์ PDF
            </a>
          ) : null}
        </div>

        {canConfirm ? (
          <div className={`mt-4 ${prbSectionCard}`}>
            <p className="mb-3 text-sm text-slate-600">
              ได้รับเอกสารแล้วหรือยัง?
            </p>
            <button
              type="button"
              className={prbCta}
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  await confirmPrbOrder(id!);
                  notify("ยืนยันรับเอกสารแล้ว — ขอบคุณ!", "success");
                  await load();
                } catch {
                  notify("ยืนยันไม่สำเร็จ", "error");
                } finally {
                  setBusy(false);
                }
              }}
            >
              ยืนยันรับเอกสารแล้ว
            </button>
            <textarea
              className="mt-3 w-full rounded-lg border border-slate-200 p-3 text-sm"
              placeholder="ระบุปัญหา (ถ้ามี)"
              value={disputeReason}
              onChange={(e) => setDisputeReason(e.target.value)}
            />
            <button
              type="button"
              className="mt-2 w-full rounded-xl border border-amber-300 py-3 text-sm font-medium text-amber-800"
              disabled={busy || !disputeReason.trim()}
              onClick={async () => {
                setBusy(true);
                try {
                  await disputePrbOrder(id!, disputeReason.trim());
                  notify("แจ้งปัญหาแล้ว — ทีมงานจะติดต่อกลับ", "success");
                  await load();
                } catch {
                  notify("แจ้งปัญหาไม่สำเร็จ", "error");
                } finally {
                  setBusy(false);
                }
              }}
            >
              เปิดกรณีพิพาท
            </button>
          </div>
        ) : null}
      </div>
    </Layout>
  );
}
