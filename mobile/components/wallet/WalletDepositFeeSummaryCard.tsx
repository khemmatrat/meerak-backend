/**
 * Fee breakdown from server preview — display only.
 */
import React from "react";
import { Loader2, BadgeCheck, FileText } from "lucide-react";
import type { WalletDepositPreviewResponse } from "../../types/walletDepositContract";
import type { WalletDepositPreviewRow } from "../../utils/walletDepositPreviewLabels";

export function WalletDepositFeeSummaryCard({
  rows,
  tip,
  loading,
}: {
  rows: WalletDepositPreviewRow[];
  tip: WalletDepositPreviewResponse["tip"];
  loading: boolean;
}) {
  return (
    <div
      className={`relative mb-4 rounded-2xl border border-slate-200/90 bg-gradient-to-br from-white via-slate-50/50 to-indigo-50/20 p-4 shadow-inner shadow-slate-200/30 ring-1 ring-slate-100/80 ${
        loading ? "opacity-90" : ""
      }`}
    >
      <div className="flex items-start justify-between gap-2 border-b border-slate-200/80 pb-2.5">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-widest text-indigo-600/80">
            สรุปจากระบบ
          </p>
          <p className="mt-0.5 text-xs text-slate-600">
            อ้างอิงเฉพาะตอนนี้ — เปลี่ยนยอดแล้วโหลดใหม่
          </p>
        </div>
        {loading ? (
          <Loader2
            size={18}
            className="shrink-0 animate-spin text-indigo-500"
            aria-hidden
          />
        ) : null}
      </div>
      <div className="mt-3 space-y-2.5">
        {rows.map((r) => {
          const isNet = r.key === "net";
          return (
            <div
              key={r.key}
              className={`flex items-baseline justify-between gap-3 text-sm ${
                isNet ? "mt-0.5 border-t border-slate-200/80 pt-2.5" : ""
              }`}
            >
              <span
                className={`min-w-0 shrink text-slate-600 ${
                  isNet ? "font-semibold text-slate-800" : ""
                }`}
              >
                {r.labelTh}
              </span>
              <span
                className={`text-right font-mono tracking-tight tabular-nums ${
                  isNet
                    ? "text-base font-bold text-slate-900"
                    : "font-semibold text-slate-800"
                }`}
              >
                ฿{r.valueDisplay}
              </span>
            </div>
          );
        })}
      </div>
      {tip ? (
        <p className="mt-3 rounded-xl border border-amber-200/80 bg-amber-50/90 px-3 py-2 text-[11px] leading-snug text-amber-900">
          {tip}
        </p>
      ) : null}
      <div className="mt-4 space-y-2 rounded-xl border border-slate-200/80 bg-white/90 px-3 py-2.5">
        <div className="flex gap-2 text-[11px] leading-snug text-slate-600">
          <BadgeCheck
            className="mt-0.5 shrink-0 text-emerald-600"
            size={16}
            strokeWidth={2}
            aria-hidden
          />
          <span>
            ค่าธรรมเนียมและสรุปยอดนี้อ้างอิงจากตอบกลับเซิร์ฟเวอร์
            ไม่ได้คำนวณซ้ำบนโทรศัพท์
          </span>
        </div>
        <div className="flex gap-2 text-[11px] leading-snug text-slate-600">
          <FileText
            className="mt-0.5 shrink-0 text-slate-500"
            size={16}
            strokeWidth={2}
            aria-hidden
          />
          <span>
            เลขอ้างอิงธุรกรรมได้เมื่อเริ่มขั้นชำระหรือสร้างคำขอ —
            จึงยังใช้ยืนยันรายการก่อนนั้นไม่ได้
          </span>
        </div>
      </div>
    </div>
  );
}
