import React from "react";
import { Loader2 } from "lucide-react";

export function ScopePane({
  scopeLoading,
  scopeAgreement,
  scopeDeliverables,
  setScopeDeliverables,
  scopeSubmitting,
  isEmployer,
  talentLabel,
  onSaveScope,
  onConfirmScope,
}: {
  scopeLoading: boolean;
  scopeAgreement: {
    both_confirmed?: boolean;
    deliverables?: { text?: string }[];
    employer_confirmed_at?: string | null;
    talent_confirmed_at?: string | null;
  } | null;
  scopeDeliverables: string[];
  setScopeDeliverables: React.Dispatch<React.SetStateAction<string[]>>;
  scopeSubmitting: boolean;
  isEmployer: boolean;
  talentLabel: string;
  onSaveScope: () => void;
  onConfirmScope: () => void;
}) {
  return (
    <div className="luxury-card rounded-2xl p-6 space-y-6">
      <h3 className="text-lg font-bold text-slate-100">Scope Agreement — รายการส่งมอบ</h3>
      <p className="text-slate-400 text-sm">ทั้งสองฝ่ายต้องกดยืนยันก่อนเริ่มงาน</p>
      {scopeLoading ? (
        <div className="flex items-center gap-2 text-slate-500 py-4">
          <Loader2 size={18} className="animate-spin" /> โหลด...
        </div>
      ) : scopeAgreement?.both_confirmed ? (
        <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30">
          <p className="text-emerald-400 font-medium">✓ ทั้งสองฝ่ายยืนยันแล้ว — สามารถเริ่มงานได้</p>
          <ul className="mt-2 space-y-1 text-slate-300">
            {(scopeAgreement.deliverables || []).map((d, i) => (
              <li key={i}>• {d.text || "-"}</li>
            ))}
          </ul>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="space-y-2">
            {scopeDeliverables.map((text, i) => (
              <div key={i} className="flex gap-2">
                <input
                  type="text"
                  value={text}
                  onChange={(e) =>
                    setScopeDeliverables((prev) =>
                      prev.map((p, j) => (j === i ? e.target.value : p)),
                    )
                  }
                  placeholder={`รายการที่ ${i + 1}`}
                  className="flex-1 px-4 py-2 rounded-xl bg-charcoal-800 border border-slate-600 text-slate-100"
                />
                {scopeDeliverables.length > 1 && (
                  <button
                    type="button"
                    onClick={() =>
                      setScopeDeliverables((prev) => prev.filter((_, j) => j !== i))
                    }
                    className="px-3 py-2 rounded-xl bg-slate-600 text-slate-300 hover:bg-slate-500"
                  >
                    ลบ
                  </button>
                )}
              </div>
            ))}
            <button
              type="button"
              onClick={() => setScopeDeliverables((prev) => [...prev, ""])}
              className="text-sm text-amber-400 hover:underline"
            >
              + เพิ่มรายการ
            </button>
          </div>
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={onSaveScope}
              disabled={scopeSubmitting}
              className="px-4 py-2 rounded-xl bg-amber-500 text-charcoal-900 font-medium disabled:opacity-50"
            >
              {scopeSubmitting ? (
                <Loader2 size={16} className="animate-spin inline" />
              ) : null}{" "}
              บันทึกรายการ
            </button>
            {scopeAgreement && (
              <button
                type="button"
                onClick={onConfirmScope}
                disabled={
                  scopeSubmitting ||
                  (isEmployer
                    ? !!scopeAgreement.employer_confirmed_at
                    : !!scopeAgreement.talent_confirmed_at)
                }
                className="px-4 py-2 rounded-xl bg-emerald-600 text-white font-medium disabled:opacity-50"
              >
                {scopeSubmitting ? (
                  <Loader2 size={16} className="animate-spin inline" />
                ) : null}{" "}
                ยืนยัน
              </button>
            )}
          </div>
          {scopeAgreement && (
            <p className="text-slate-500 text-sm">
              {isEmployer
                ? scopeAgreement.employer_confirmed_at
                  ? "✓ คุณยืนยันแล้ว"
                  : "รอคุณกดยืนยัน"
                : scopeAgreement.talent_confirmed_at
                  ? "✓ คุณยืนยันแล้ว"
                  : "รอคุณกดยืนยัน"}
              {" · "}
              {isEmployer
                ? scopeAgreement.talent_confirmed_at
                  ? `✓ ${talentLabel} ยืนยันแล้ว`
                  : `รอ ${talentLabel} ยืนยัน`
                : scopeAgreement.employer_confirmed_at
                  ? "✓ นายจ้างยืนยันแล้ว"
                  : "รอนายจ้างยืนยัน"}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
