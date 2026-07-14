import React from "react";
import {
  TrendingDown,
  Zap,
  ShieldCheck,
  Clock,
  AlertTriangle,
  History,
  Send,
} from "lucide-react";
import type {
  AdvanceApplicantWithUser,
  QuotationCompareMeta,
  QuotationScoreBadge,
  AdvanceQuotationVersion,
} from "../types/api";

const BADGE_CONFIG: Record<
  QuotationScoreBadge,
  { label: string; icon: React.ReactNode; className: string }
> = {
  best_value: {
    label: "Best value",
    icon: <TrendingDown size={12} />,
    className: "bg-emerald-500/20 text-emerald-300 border-emerald-500/30",
  },
  fastest: {
    label: "Fastest",
    icon: <Zap size={12} />,
    className: "bg-sky-500/20 text-sky-300 border-sky-500/30",
  },
  most_trusted: {
    label: "Most trusted",
    icon: <ShieldCheck size={12} />,
    className: "bg-amber-500/20 text-amber-300 border-amber-500/30",
  },
};

function kycLabel(level?: string | null, badge?: string | null) {
  if (badge) return badge;
  if (!level) return "—";
  if (level.includes("2") || level.includes("gold")) return "KYC L2";
  if (level.includes("1") || level.includes("silver")) return "KYC L1";
  return level;
}

interface Props {
  applicants: AdvanceApplicantWithUser[];
  scores?: QuotationCompareMeta;
  onSelect?: (applicant: AdvanceApplicantWithUser) => void;
  onCounterOffer?: (applicant: AdvanceApplicantWithUser) => void;
  onViewVersions?: (applicant: AdvanceApplicantWithUser) => void;
  selecting?: string | null;
}

export const QuotationCompareTable: React.FC<Props> = ({
  applicants,
  scores,
  onSelect,
  onCounterOffer,
  onViewVersions,
  selecting,
}) => {
  const withQuotes = applicants.filter((a) => a.quotation?.total_amount);
  if (withQuotes.length === 0) return null;

  return (
    <div className="rounded-xl border border-slate-600/50 overflow-hidden">
      <div className="px-4 py-3 bg-slate-800/80 border-b border-slate-700/50">
        <h3 className="text-sm font-semibold text-slate-200">
          เปรียบเทียบใบเสนอราคา
        </h3>
        {scores?.expiry_rules && (
          <p className="text-xs text-slate-500 mt-0.5">
            หมดอายุอัตโนมัติภายใน {scores.expiry_rules.default_hours} ชม. หรือ
            valid_until · สูงสุด v{scores.expiry_rules.max_versions} ·
            แจ้งเตือนก่อนหมดอายุ {scores.expiry_rules.reminder_hours_before} ชม.
          </p>
        )}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm min-w-[640px]">
          <thead>
            <tr className="text-left text-xs text-slate-500 border-b border-slate-700/50">
              <th className="px-3 py-2 font-medium">Talent</th>
              <th className="px-3 py-2 font-medium">ราคา</th>
              <th className="px-3 py-2 font-medium">เวลา</th>
              <th className="px-3 py-2 font-medium">คะแนน</th>
              <th className="px-3 py-2 font-medium">KYC</th>
              <th className="px-3 py-2 font-medium">งานสำเร็จ</th>
              <th className="px-3 py-2 font-medium">สถานะ</th>
              <th className="px-3 py-2 font-medium" />
            </tr>
          </thead>
          <tbody>
            {withQuotes.map((a) => {
              const q = a.quotation!;
              const expired =
                a.quotation_expired || q.expired || q.status === "expired";
              const badges =
                a.score_badges || scores?.badges?.[a.user_id] || [];
              return (
                <tr
                  key={a.id}
                  className={`border-b border-slate-800/80 ${expired ? "opacity-60" : ""}`}
                >
                  <td className="px-3 py-2.5">
                    <p className="font-medium text-slate-200 truncate max-w-[120px]">
                      {a.full_name || a.user_id}
                    </p>
                    {q.version ? (
                      <span className="text-xs text-slate-500">
                        v{q.version}
                      </span>
                    ) : null}
                  </td>
                  <td className="px-3 py-2.5 text-emerald-300 font-semibold whitespace-nowrap">
                    ฿{Number(q.total_amount).toLocaleString("th-TH")}
                  </td>
                  <td className="px-3 py-2.5 text-slate-300 whitespace-nowrap">
                    {q.timeline_days ? `${q.timeline_days} วัน` : "—"}
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="flex flex-wrap gap-1">
                      {badges.map((b) => {
                        const cfg = BADGE_CONFIG[b];
                        return (
                          <span
                            key={b}
                            className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-medium border ${cfg.className}`}
                          >
                            {cfg.icon}
                            {cfg.label}
                          </span>
                        );
                      })}
                      {typeof a.trust_score === "number" &&
                        a.trust_score > 0 && (
                          <span className="text-[10px] text-slate-500">
                            ({Math.round(a.trust_score)})
                          </span>
                        )}
                    </div>
                  </td>
                  <td className="px-3 py-2.5 text-xs text-slate-400">
                    {kycLabel(a.kyc_level, a.verified_badge)}
                  </td>
                  <td className="px-3 py-2.5 text-slate-300">
                    {a.completed_jobs_count ?? 0}
                  </td>
                  <td className="px-3 py-2.5">
                    {expired ? (
                      <span className="inline-flex items-center gap-1 text-xs text-red-400">
                        <AlertTriangle size={12} /> หมดอายุ
                      </span>
                    ) : q.expires_at ? (
                      <span className="inline-flex items-center gap-1 text-xs text-slate-500">
                        <Clock size={12} />
                        {new Date(q.expires_at).toLocaleDateString("th-TH", {
                          day: "numeric",
                          month: "short",
                        })}
                      </span>
                    ) : (
                      <span className="text-xs text-emerald-400">Active</span>
                    )}
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="flex gap-1">
                      {onViewVersions && (
                        <button
                          type="button"
                          onClick={() => onViewVersions(a)}
                          className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-700/50"
                          title="ประวัติเวอร์ชัน"
                        >
                          <History size={14} />
                        </button>
                      )}
                      {!expired && onCounterOffer && (
                        <button
                          type="button"
                          onClick={() => onCounterOffer(a)}
                          className="p-1.5 rounded-lg text-amber-400 hover:bg-amber-500/10"
                          title="Counter-offer"
                        >
                          <Send size={14} />
                        </button>
                      )}
                      {onSelect && !expired && a.status !== "hired" && (
                        <button
                          type="button"
                          disabled={selecting === a.user_id}
                          onClick={() => onSelect(a)}
                          className="px-2 py-1 rounded-lg bg-emerald-600 text-white text-xs font-medium hover:bg-emerald-500 disabled:opacity-50"
                        >
                          เลือก
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};

interface VersionPanelProps {
  versions: AdvanceQuotationVersion[];
  talentName?: string;
  onClose: () => void;
}

export const QuotationVersionPanel: React.FC<VersionPanelProps> = ({
  versions,
  talentName,
  onClose,
}) => (
  <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/60">
    <div className="w-full max-w-md rounded-2xl bg-charcoal-900 border border-slate-600 shadow-xl max-h-[80vh] overflow-hidden flex flex-col">
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-700">
        <h3 className="font-semibold text-slate-100">
          ประวัติใบเสนอราคา {talentName ? `— ${talentName}` : ""}
        </h3>
        <button
          type="button"
          onClick={onClose}
          className="text-slate-400 hover:text-slate-200 text-sm"
        >
          ปิด
        </button>
      </div>
      <div className="overflow-y-auto p-4 space-y-3">
        {versions.length === 0 ? (
          <p className="text-slate-500 text-center py-4">
            ยังไม่มีประวัติเวอร์ชัน
          </p>
        ) : (
          versions.map((v) => (
            <div
              key={v.id}
              className={`rounded-xl p-3 border ${
                v.status === "active"
                  ? "border-emerald-500/30 bg-emerald-500/10"
                  : "border-slate-700 bg-slate-800/50"
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-semibold text-slate-200">
                  v{v.version}{" "}
                  <span className="text-xs font-normal text-slate-500">
                    ({v.proposed_by === "employer" ? "นายจ้าง" : "Talent"})
                  </span>
                </span>
                <span className="text-emerald-300 font-bold">
                  ฿{Number(v.quotation.total_amount).toLocaleString("th-TH")}
                </span>
              </div>
              {v.edit_reason && (
                <p className="text-xs text-amber-200/90 mt-1">
                  เหตุผล: {v.edit_reason}
                </p>
              )}
              {v.quotation.timeline_days && (
                <p className="text-xs text-slate-400 mt-1">
                  Timeline: {v.quotation.timeline_days} วัน
                </p>
              )}
              <p className="text-xs text-slate-500 mt-1">
                {new Date(v.created_at).toLocaleString("th-TH")}
                {v.status === "expired" && " · หมดอายุ"}
              </p>
            </div>
          ))
        )}
      </div>
    </div>
  </div>
);

interface CounterOfferModalProps {
  applicant: AdvanceApplicantWithUser;
  maxBudget?: number;
  currentVersion?: number;
  maxVersions?: number;
  submitting: boolean;
  onSubmit: (amount: number, timelineDays: number, editReason: string) => void;
  onClose: () => void;
}

export const CounterOfferModal: React.FC<CounterOfferModalProps> = ({
  applicant,
  maxBudget,
  currentVersion = 1,
  maxVersions = 3,
  submitting,
  onSubmit,
  onClose,
}) => {
  const q = applicant.quotation;
  const [amount, setAmount] = useState(
    String(q?.total_amount || maxBudget || ""),
  );
  const [timeline, setTimeline] = useState(String(q?.timeline_days || 7));
  const [reason, setReason] = useState("");
  const nextVersion = (currentVersion || 1) + 1;

  if (nextVersion > maxVersions) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60">
        <div className="rounded-2xl bg-charcoal-900 border border-slate-600 p-6 max-w-sm w-full text-center">
          <p className="text-slate-200">
            ถึงขีดจำกัด counter-offer แล้ว (v{maxVersions})
          </p>
          <button
            type="button"
            onClick={onClose}
            className="mt-4 px-4 py-2 rounded-xl bg-slate-700 text-slate-200"
          >
            ปิด
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60">
      <div className="rounded-2xl bg-charcoal-900 border border-slate-600 p-6 max-w-md w-full space-y-4">
        <h3 className="font-semibold text-slate-100">
          Counter-offer v{nextVersion} — {applicant.full_name}
        </h3>
        <div>
          <label className="text-xs text-slate-400">ราคา (THB)</label>
          <input
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="w-full mt-1 px-3 py-2 rounded-xl bg-slate-800 border border-slate-600 text-slate-100"
          />
        </div>
        <div>
          <label className="text-xs text-slate-400">Timeline (วัน)</label>
          <input
            type="number"
            value={timeline}
            onChange={(e) => setTimeline(e.target.value)}
            className="w-full mt-1 px-3 py-2 rounded-xl bg-slate-800 border border-slate-600 text-slate-100"
          />
        </div>
        <div>
          <label className="text-xs text-slate-400">
            เหตุผลการแก้ไข <span className="text-red-400">*</span>
          </label>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={2}
            placeholder="เช่น ปรับ scope ลดลง / งบจำกัด / ขยาย timeline"
            className="w-full mt-1 px-3 py-2 rounded-xl bg-slate-800 border border-slate-600 text-slate-100 text-sm"
          />
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-2 rounded-xl bg-slate-700 text-slate-200"
          >
            ยกเลิก
          </button>
          <button
            type="button"
            disabled={submitting || !reason.trim() || !amount.trim()}
            onClick={() =>
              onSubmit(
                Math.max(0, Number(amount)),
                Math.max(1, Number(timeline) || 7),
                reason.trim(),
              )
            }
            className="flex-1 py-2 rounded-xl bg-amber-500 text-charcoal-900 font-medium disabled:opacity-50"
          >
            {submitting ? "กำลังส่ง..." : `ส่ง v${nextVersion}`}
          </button>
        </div>
      </div>
    </div>
  );
};
