/**
 * ReviewManagementView.tsx — Nexus Admin Core
 * ─────────────────────────────────────────────────────────────────────
 * Admin Governance Panel: Rating & Review System
 *
 * Tabs:
 *  1. Reviews   — รายการรีวิวพร้อม AI-flag highlight, Verify, Flag, Shadow Ban
 *  2. Disputes  — Dispute Resolution: เปรียบเทียบ complaint vs. worker evidence
 *  3. Workers   — Worker Grade table พร้อม Ban/Lift controls
 *
 * All API calls use adminApi.ts (request() helper with Bearer token).
 */

import React, { useEffect, useState, useCallback } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  XCircle,
  ShieldBan,
  ShieldCheck,
  Star,
  Eye,
  Flag,
  MessageSquare,
  Users,
  RefreshCw,
  Crown,
  ChevronDown,
  ChevronUp,
  Image as ImageIcon,
  Shield,
} from "lucide-react";
import {
  getAdminReviews,
  adminVerifyReview,
  adminFlagReview,
  adminShadowBanWorker,
  adminLiftShadowBan,
  getAdminDisputes,
  adminResolveDispute,
  getAdminWorkers,
  getAdminToken,
  type AdminReviewRow,
  type AdminDisputeRow,
  type AdminWorkerRow,
  type WorkerGrade,
} from "../services/adminApi";

// ─── Tab IDs ──────────────────────────────────────────────────────────────
type TabId = "reviews" | "disputes" | "workers";

// ─── Grade styling config ─────────────────────────────────────────────────
const GRADE_STYLE: Record<WorkerGrade, { bg: string; text: string; label: string }> = {
  A: { bg: "linear-gradient(135deg,#D4AF37,#F5E27D,#B8860B)", text: "#fff", label: "VVIP Elite" },
  B: { bg: "linear-gradient(135deg,#6366F1,#818CF8)",          text: "#fff", label: "Professional" },
  C: { bg: "linear-gradient(135deg,#475569,#64748B)",           text: "#fff", label: "Standard" },
};

// ─── Shared UI helpers ────────────────────────────────────────────────────

const StarRow: React.FC<{ value: number }> = ({ value }) => (
  <span className="flex items-center gap-0.5">
    {Array.from({ length: 5 }).map((_, i) => (
      <Star
        key={i}
        size={12}
        className={i < Math.round(value) ? "text-amber-400 fill-amber-400" : "text-slate-300"}
      />
    ))}
    <span className="ml-1 text-xs text-slate-500">{Number(value).toFixed(1)}</span>
  </span>
);

const GradePill: React.FC<{ grade: WorkerGrade | null }> = ({ grade }) => {
  if (!grade) return <span className="text-slate-400 text-xs">—</span>;
  const s = GRADE_STYLE[grade];
  return (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold"
      style={{ background: s.bg, color: s.text }}
    >
      {grade}
    </span>
  );
};

const StatusBadge: React.FC<{ label: string; color: string }> = ({ label, color }) => (
  <span className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full ${color}`}>
    {label}
  </span>
);

// ─── Review Row ────────────────────────────────────────────────────────────

const ReviewRow: React.FC<{
  review: AdminReviewRow;
  onVerify:    (id: string, v: boolean) => void;
  onFlag:      (id: string, f: boolean) => void;
  onShadowBan: (workerId: string, name: string) => void;
  onLiftBan:   (workerId: string) => void;
}> = ({ review, onVerify, onFlag, onShadowBan, onLiftBan }) => {
  const [expanded, setExpanded] = useState(false);
  const hasAiFlag  = !!review.ai_flag;
  const isBanned   = !!review.shadow_banned_at;

  return (
    <div
      className={`rounded-xl border p-4 transition-all ${
        hasAiFlag
          ? "border-rose-300 bg-rose-50"
          : review.is_verified
          ? "border-emerald-200 bg-emerald-50/40"
          : "border-slate-200 bg-white"
      }`}
    >
      {/* ── Header ── */}
      <div className="flex flex-wrap items-start gap-3">
        {/* AI-flag banner */}
        {hasAiFlag && (
          <div className="flex items-center gap-1.5 bg-rose-100 text-rose-700 text-xs font-semibold px-2.5 py-1 rounded-lg border border-rose-200">
            <AlertTriangle size={12} />
            AI Flag: {review.ai_flag}
          </div>
        )}

        {/* Names */}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-slate-800 truncate">
            <span className="font-normal text-slate-500">จาก</span>{" "}
            {review.reviewer_name}{" "}
            <span className="text-slate-400">→</span>{" "}
            <span className="text-indigo-700">{review.reviewee_name}</span>{" "}
            <GradePill grade={review.worker_grade} />
          </p>
          <p className="text-xs text-slate-400 mt-0.5">
            Job: {review.job_id} &nbsp;•&nbsp;{" "}
            {new Date(review.created_at).toLocaleString("th-TH")}
          </p>
        </div>

        <StarRow value={review.rating_overall} />

        {/* Status badges */}
        <div className="flex flex-wrap items-center gap-1.5">
          {review.is_verified && (
            <StatusBadge label="Verified"  color="bg-emerald-100 text-emerald-700" />
          )}
          {review.is_flagged && (
            <StatusBadge label="Flagged"   color="bg-orange-100 text-orange-700" />
          )}
          {review.dispute_status === "pending" && (
            <StatusBadge label="Dispute"   color="bg-yellow-100 text-yellow-700" />
          )}
          {isBanned && (
            <StatusBadge label="Banned"    color="bg-slate-800 text-white" />
          )}
        </div>

        <button
          onClick={() => setExpanded((p) => !p)}
          className="text-slate-400 hover:text-slate-600"
        >
          {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </button>
      </div>

      {/* Comment preview */}
      {review.comment && (
        <p className="mt-2 text-sm text-slate-600 line-clamp-2 italic">
          "{review.comment}"
        </p>
      )}

      {/* Expanded detail */}
      {expanded && (
        <div className="mt-3 pt-3 border-t border-slate-200 space-y-3">
          {/* Category ratings */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
            {(
              [
                ["ฝีมือ",         review.rating_quality],
                ["ตรงเวลา",       review.rating_punctuality],
                ["มารยาท",        review.rating_attitude],
                ["ความสะอาด",     review.rating_cleanliness],
                ["การสื่อสาร",    review.rating_communication],
              ] as [string, number | null][]
            )
              .filter(([, v]) => v != null)
              .map(([label, val]) => (
                <div
                  key={label}
                  className="flex justify-between items-center bg-slate-50 rounded-lg px-2 py-1"
                >
                  <span className="text-slate-500">{label}</span>
                  <StarRow value={val as number} />
                </div>
              ))}
          </div>

          {/* Smart tags */}
          {review.tags?.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {review.tags.map((t) => (
                <span
                  key={t}
                  className="text-[11px] bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded-full border border-indigo-100"
                >
                  {t}
                </span>
              ))}
            </div>
          )}

          {/* Action buttons */}
          <div className="flex flex-wrap gap-2 pt-1">
            {/* Verify / Unverify */}
            <button
              onClick={() => onVerify(review.id, !review.is_verified)}
              className={`flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg transition-colors ${
                review.is_verified
                  ? "bg-slate-100 text-slate-600 hover:bg-slate-200"
                  : "bg-emerald-100 text-emerald-700 hover:bg-emerald-200"
              }`}
            >
              <CheckCircle2 size={13} />
              {review.is_verified ? "Unverify" : "Verify Review"}
            </button>

            {/* Flag / Unflag */}
            <button
              onClick={() => onFlag(review.id, !review.is_flagged)}
              className={`flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg transition-colors ${
                review.is_flagged
                  ? "bg-orange-50 text-orange-700 hover:bg-orange-100"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              <Flag size={13} />
              {review.is_flagged ? "Unflag" : "Flag Review"}
            </button>

            {/* Shadow Ban / Lift */}
            {isBanned ? (
              <button
                onClick={() => onLiftBan(review.reviewee_id)}
                className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg bg-emerald-50 text-emerald-700 hover:bg-emerald-100 transition-colors"
              >
                <ShieldCheck size={13} /> Lift Ban
              </button>
            ) : (
              <button
                onClick={() => onShadowBan(review.reviewee_id, review.reviewee_name)}
                className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg bg-slate-800 text-white hover:bg-slate-900 transition-colors"
              >
                <ShieldBan size={13} /> Shadow Ban
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

// ─── Dispute Row ───────────────────────────────────────────────────────────

const DisputeRow: React.FC<{
  dispute: AdminDisputeRow;
  onResolve: (id: string, favor: "worker" | "client") => void;
}> = ({ dispute, onResolve }) => {
  const [expanded, setExpanded] = useState(false);
  const resolved = dispute.dispute_status === "resolved";

  return (
    <div
      className={`rounded-xl border p-4 ${
        resolved
          ? "border-slate-200 bg-slate-50 opacity-70"
          : "border-amber-300 bg-amber-50"
      }`}
    >
      <div className="flex items-start gap-3">
        <div className="flex-1">
          <p className="text-sm font-semibold text-slate-800">
            {dispute.reviewer_name}{" "}
            <span className="text-slate-400 font-normal">vs</span>{" "}
            <span className="text-indigo-700">{dispute.reviewee_name}</span>
          </p>
          <p className="text-xs text-slate-400 mt-0.5">
            Job: {dispute.job_id} &nbsp;•&nbsp;{" "}
            {new Date(dispute.created_at).toLocaleString("th-TH")}
          </p>
        </div>
        <span
          className={`text-xs px-2 py-0.5 rounded-full font-semibold ${
            resolved ? "bg-slate-200 text-slate-600" : "bg-amber-200 text-amber-800"
          }`}
        >
          {resolved ? "Resolved" : "Pending"}
        </span>
        <button
          onClick={() => setExpanded((p) => !p)}
          className="text-slate-400 hover:text-slate-600"
        >
          {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </button>
      </div>

      {expanded && (
        <div className="mt-3 pt-3 border-t border-amber-200 grid md:grid-cols-2 gap-4">
          {/* Client complaint */}
          <div className="bg-white rounded-xl p-4 border border-rose-100">
            <p className="text-xs font-bold text-rose-600 mb-2 uppercase tracking-wide">
              คำร้องเรียนของลูกค้า
            </p>
            <div className="flex items-center gap-1 mb-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <Star
                  key={i}
                  size={13}
                  className={
                    i < dispute.rating_overall
                      ? "text-amber-400 fill-amber-400"
                      : "text-slate-200"
                  }
                />
              ))}
              <span className="text-xs text-slate-500 ml-1">
                {dispute.rating_overall} ดาว
              </span>
            </div>
            <p className="text-sm text-slate-700 italic">
              "{dispute.comment}"
            </p>
            {dispute.flagged_reason && (
              <div className="mt-2 text-xs text-rose-600 bg-rose-50 rounded-lg p-2 flex items-center gap-1">
                <AlertTriangle size={11} />
                {dispute.flagged_reason}
              </div>
            )}
          </div>

          {/* Worker defence */}
          <div className="bg-white rounded-xl p-4 border border-indigo-100">
            <p className="text-xs font-bold text-indigo-600 mb-2 uppercase tracking-wide">
              หลักฐานของผู้รับงาน
            </p>
            <p className="text-sm text-slate-700 mb-3">
              {dispute.dispute_text || "(ไม่มีคำชี้แจง)"}
            </p>
            {dispute.dispute_images?.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {dispute.dispute_images.slice(0, 4).map((img, idx) => (
                  <a
                    key={idx}
                    href={img}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block w-16 h-16 rounded-lg overflow-hidden border border-indigo-200 hover:opacity-90 transition-opacity"
                  >
                    <img
                      src={img}
                      alt={`evidence-${idx}`}
                      className="w-full h-full object-cover"
                    />
                  </a>
                ))}
              </div>
            ) : (
              <p className="text-xs text-slate-400 flex items-center gap-1">
                <ImageIcon size={12} /> ไม่มีรูปหลักฐาน
              </p>
            )}
          </div>

          {/* Resolution info or action buttons */}
          {resolved ? (
            <div className="md:col-span-2 bg-emerald-50 rounded-xl p-3 border border-emerald-200">
              <p className="text-xs font-bold text-emerald-700 mb-1">ผลการตัดสิน</p>
              <p className="text-sm text-slate-700">
                {dispute.dispute_resolution || "—"}
              </p>
            </div>
          ) : (
            <div className="md:col-span-2 flex gap-3 pt-1">
              <button
                onClick={() => onResolve(dispute.id, "worker")}
                className="flex-1 py-2.5 text-sm font-semibold bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 transition-colors"
              >
                ✅ เข้าข้างผู้รับงาน (ลบ Flag)
              </button>
              <button
                onClick={() => onResolve(dispute.id, "client")}
                className="flex-1 py-2.5 text-sm font-semibold bg-rose-600 text-white rounded-xl hover:bg-rose-700 transition-colors"
              >
                ⚠️ เข้าข้างลูกค้า (Flag คงอยู่)
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// ─── Worker Grade Table ────────────────────────────────────────────────────

const WorkerGradeTable: React.FC<{
  workers: AdminWorkerRow[];
  onBan:  (id: string, name: string) => void;
  onLift: (id: string) => void;
}> = ({ workers, onBan, onLift }) => (
  <div className="overflow-x-auto rounded-xl border border-slate-200">
    <table className="w-full text-sm">
      <thead className="bg-slate-50 border-b border-slate-200">
        <tr>
          {[
            "ชื่อผู้รับงาน",
            "Grade",
            "Rating",
            "Jobs",
            "Success %",
            "VVIP",
            "สถานะ",
            "Actions",
          ].map((h) => (
            <th
              key={h}
              className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide whitespace-nowrap"
            >
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody className="divide-y divide-slate-100">
        {workers.map((w) => (
          <tr
            key={w.id}
            className={`hover:bg-slate-50 transition-colors ${
              w.shadow_banned_at ? "opacity-60" : ""
            }`}
          >
            <td className="px-4 py-3">
              <p className="font-medium text-slate-900">{w.full_name}</p>
              <p className="text-xs text-slate-400">{w.email}</p>
            </td>
            <td className="px-4 py-3">
              <GradePill grade={w.worker_grade} />
            </td>
            <td className="px-4 py-3">
              <StarRow value={w.avg_rating || 0} />
              <p className="text-xs text-slate-400 mt-0.5">
                {w.total_reviews} reviews
              </p>
            </td>
            <td className="px-4 py-3 text-center text-slate-700">
              {w.total_jobs}
            </td>
            <td className="px-4 py-3 text-center">
              <span
                className={`text-xs font-bold ${
                  w.success_rate >= 95
                    ? "text-emerald-600"
                    : w.success_rate >= 70
                    ? "text-amber-600"
                    : "text-rose-500"
                }`}
              >
                {Number(w.success_rate || 0).toFixed(0)}%
              </span>
            </td>
            <td className="px-4 py-3 text-center">
              {w.is_vvip_eligible ? (
                <Crown size={16} className="text-amber-500 fill-amber-400 mx-auto" />
              ) : (
                <span className="text-slate-300 text-xs">—</span>
              )}
            </td>
            <td className="px-4 py-3">
              {w.shadow_banned_at ? (
                <div>
                  <span className="text-xs font-semibold bg-slate-200 text-slate-700 px-2 py-0.5 rounded-full">
                    Banned
                  </span>
                  {w.ban_reason && (
                    <p className="text-[10px] text-slate-400 mt-0.5 truncate max-w-[120px]">
                      {w.ban_reason}
                    </p>
                  )}
                </div>
              ) : (
                <span className="text-xs text-emerald-600 font-medium">Active</span>
              )}
            </td>
            <td className="px-4 py-3">
              {w.shadow_banned_at ? (
                <button
                  onClick={() => onLift(w.id)}
                  className="flex items-center gap-1 text-xs bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200 px-2.5 py-1 rounded-lg transition-colors font-medium"
                >
                  <ShieldCheck size={12} /> Lift
                </button>
              ) : (
                <button
                  onClick={() => onBan(w.id, w.full_name)}
                  className="flex items-center gap-1 text-xs bg-slate-100 text-slate-700 hover:bg-slate-200 px-2.5 py-1 rounded-lg transition-colors font-medium"
                >
                  <ShieldBan size={12} /> Ban
                </button>
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
    {workers.length === 0 && (
      <div className="py-12 text-center text-slate-400 text-sm">ไม่พบข้อมูล</div>
    )}
  </div>
);

// ─── Shadow Ban Modal ──────────────────────────────────────────────────────

const BanModal: React.FC<{
  target: { id: string; name: string } | null;
  onConfirm: (reason: string) => void;
  onCancel:  () => void;
}> = ({ target, onConfirm, onCancel }) => {
  const [reason, setReason] = useState("");
  if (!target) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-md mx-4">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 bg-slate-800 rounded-xl flex items-center justify-center">
            <ShieldBan size={20} className="text-white" />
          </div>
          <div>
            <h3 className="font-bold text-slate-900">Shadow Ban Worker</h3>
            <p className="text-sm text-slate-500">{target.name}</p>
          </div>
        </div>
        <p className="text-sm text-slate-600 mb-4">
          Shadow ban จะระงับสิทธิ์รับงาน VVIP ชั่วคราว และถอด VVIP Eligibility ออกทันที
        </p>
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="ระบุเหตุผล เช่น รีวิวต่ำ 3 ครั้งติดต่อกัน"
          className="w-full border border-slate-300 rounded-xl p-3 text-sm h-24 resize-none focus:ring-2 focus:ring-slate-400 focus:border-slate-400 outline-none"
        />
        <div className="flex gap-3 mt-4">
          <button
            onClick={onCancel}
            className="flex-1 py-2.5 rounded-xl border border-slate-200 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            ยกเลิก
          </button>
          <button
            onClick={() => { onConfirm(reason); setReason(""); }}
            disabled={!reason.trim()}
            className="flex-1 py-2.5 rounded-xl bg-slate-800 text-white text-sm font-bold hover:bg-slate-900 disabled:opacity-40 transition-colors"
          >
            ยืนยัน Shadow Ban
          </button>
        </div>
      </div>
    </div>
  );
};

// ─── Toast notification ────────────────────────────────────────────────────

const Toast: React.FC<{ message: string | null }> = ({ message }) => {
  if (!message) return null;
  return (
    <div className="fixed top-4 right-4 z-50 bg-slate-900 text-white text-sm font-medium px-4 py-2.5 rounded-xl shadow-2xl">
      {message}
    </div>
  );
};

// ─── Main Component ────────────────────────────────────────────────────────

export const ReviewManagementView: React.FC = () => {
  const [activeTab, setActiveTab] = useState<TabId>("reviews");
  const [reviews,   setReviews]   = useState<AdminReviewRow[]>([]);
  const [disputes,  setDisputes]  = useState<AdminDisputeRow[]>([]);
  const [workers,   setWorkers]   = useState<AdminWorkerRow[]>([]);
  const [loading,   setLoading]   = useState(false);
  const [flaggedOnly, setFlaggedOnly] = useState(false);
  const [banTarget,   setBanTarget]   = useState<{ id: string; name: string } | null>(null);
  const [toast,       setToast]       = useState<string | null>(null);
  const hasToken = !!getAdminToken();

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  };

  const loadData = useCallback(async () => {
    if (!hasToken) return;
    setLoading(true);
    try {
      if (activeTab === "reviews") {
        const data = await getAdminReviews({ flagged: flaggedOnly ? true : undefined, limit: 60 });
        setReviews(data.reviews);
      } else if (activeTab === "disputes") {
        const data = await getAdminDisputes("pending");
        setDisputes(data.disputes);
      } else if (activeTab === "workers") {
        const data = await getAdminWorkers({ limit: 100 });
        setWorkers(data.workers);
      }
    } catch (err) {
      console.error("[ReviewManagementView] loadData:", err);
    } finally {
      setLoading(false);
    }
  }, [activeTab, flaggedOnly, hasToken]);

  useEffect(() => { loadData(); }, [loadData]);

  // ── Action handlers ────────────────────────────────────────────────

  const handleVerify = async (id: string, verified: boolean) => {
    await adminVerifyReview(id, verified);
    setReviews((prev) =>
      prev.map((r) => (r.id === id ? { ...r, is_verified: verified } : r))
    );
    showToast(verified ? "✅ Review verified" : "Review unverified");
  };

  const handleFlag = async (id: string, flagged: boolean) => {
    await adminFlagReview(id, flagged, flagged ? "Admin flagged" : "");
    setReviews((prev) =>
      prev.map((r) => (r.id === id ? { ...r, is_flagged: flagged } : r))
    );
    showToast(flagged ? "🚩 Review flagged" : "Flag removed");
  };

  const handleShadowBan = async (reason: string) => {
    if (!banTarget) return;
    await adminShadowBanWorker(banTarget.id, reason);
    const now = new Date().toISOString();
    setReviews((prev) =>
      prev.map((r) =>
        r.reviewee_id === banTarget.id ? { ...r, shadow_banned_at: now } : r
      )
    );
    setWorkers((prev) =>
      prev.map((w) =>
        w.id === banTarget.id ? { ...w, shadow_banned_at: now, ban_reason: reason } : w
      )
    );
    showToast(`🚫 ${banTarget.name} shadow banned`);
    setBanTarget(null);
  };

  const handleLiftBan = async (workerId: string) => {
    await adminLiftShadowBan(workerId);
    setReviews((prev) =>
      prev.map((r) =>
        r.reviewee_id === workerId ? { ...r, shadow_banned_at: null } : r
      )
    );
    setWorkers((prev) =>
      prev.map((w) =>
        w.id === workerId ? { ...w, shadow_banned_at: null, ban_reason: null } : w
      )
    );
    showToast("✅ Shadow ban lifted");
  };

  const handleResolveDispute = async (id: string, favor: "worker" | "client") => {
    await adminResolveDispute(id, `Resolved in favor of ${favor}`, favor);
    setDisputes((prev) => prev.filter((d) => d.id !== id));
    showToast(favor === "worker" ? "✅ Worker vindicated" : "⚠️ Client complaint upheld");
  };

  // ── Tab config ─────────────────────────────────────────────────────

  const TABS = [
    { id: "reviews"  as TabId, label: "Reviews",  icon: <Eye size={15} /> },
    { id: "disputes" as TabId, label: "Disputes", icon: <MessageSquare size={15} /> },
    { id: "workers"  as TabId, label: "Workers",  icon: <Users size={15} /> },
  ];

  // ── No token guard ──────────────────────────────────────────────────

  if (!hasToken) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-slate-400 gap-3">
        <Shield size={40} className="text-slate-300" />
        <p className="text-sm">กรุณา Login ด้วยบัญชี Admin ก่อนใช้งานหน้านี้</p>
      </div>
    );
  }

  // ── Render ──────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      <Toast message={toast} />

      {/* Summary stats */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-rose-50 border border-rose-200 rounded-xl p-4">
          <div className="text-2xl font-bold text-rose-600">
            {reviews.filter((r) => r.ai_flag).length}
          </div>
          <div className="text-xs text-rose-500 font-medium mt-0.5">AI Flagged Reviews</div>
        </div>
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
          <div className="text-2xl font-bold text-amber-600">{disputes.length}</div>
          <div className="text-xs text-amber-500 font-medium mt-0.5">Pending Disputes</div>
        </div>
        <div className="bg-slate-100 border border-slate-200 rounded-xl p-4">
          <div className="text-2xl font-bold text-slate-700">
            {workers.filter((w) => w.shadow_banned_at).length}
          </div>
          <div className="text-xs text-slate-500 font-medium mt-0.5">Shadow Banned</div>
        </div>
      </div>

      {/* Tabs + refresh */}
      <div className="flex items-center gap-3">
        <div className="flex gap-1 bg-slate-100 p-1 rounded-xl flex-1">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex-1 flex items-center justify-center gap-2 py-2 text-sm font-medium rounded-lg transition-all ${
                activeTab === tab.id
                  ? "bg-white text-slate-900 shadow-sm"
                  : "text-slate-500 hover:text-slate-700"
              }`}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </div>
        <button
          onClick={loadData}
          disabled={loading}
          className="flex items-center gap-2 text-sm bg-white border border-slate-200 text-slate-700 px-4 py-2.5 rounded-xl hover:bg-slate-50 transition-colors shadow-sm"
        >
          <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
          รีเฟรช
        </button>
      </div>

      {/* Content */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-20 bg-slate-100 rounded-xl animate-pulse" />
          ))}
        </div>
      ) : (
        <>
          {/* ── Reviews Tab ── */}
          {activeTab === "reviews" && (
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <button
                    role="switch"
                    aria-checked={flaggedOnly}
                    onClick={() => setFlaggedOnly((p) => !p)}
                    className={`w-10 h-5 rounded-full transition-colors ${
                      flaggedOnly ? "bg-rose-500" : "bg-slate-300"
                    }`}
                  >
                    <div
                      className={`w-4 h-4 bg-white rounded-full shadow-sm mt-0.5 transition-transform ${
                        flaggedOnly ? "translate-x-5" : "translate-x-0.5"
                      }`}
                    />
                  </button>
                  <span className="text-sm text-slate-600 font-medium">
                    แสดงเฉพาะที่ถูก Flag
                  </span>
                </label>
                <span className="text-xs text-slate-400">{reviews.length} รายการ</span>
              </div>

              {reviews.length === 0 ? (
                <div className="text-center py-12 text-slate-400 text-sm">
                  ไม่พบรีวิว
                </div>
              ) : (
                reviews.map((r) => (
                  <ReviewRow
                    key={r.id}
                    review={r}
                    onVerify={handleVerify}
                    onFlag={handleFlag}
                    onShadowBan={(id, name) => setBanTarget({ id, name })}
                    onLiftBan={handleLiftBan}
                  />
                ))
              )}
            </div>
          )}

          {/* ── Disputes Tab ── */}
          {activeTab === "disputes" && (
            <div className="space-y-4">
              {disputes.length === 0 ? (
                <div className="flex flex-col items-center py-16 text-slate-400 gap-2">
                  <CheckCircle2 size={36} className="text-emerald-400" />
                  <p className="text-sm">ไม่มี Dispute ที่รอดำเนินการ</p>
                </div>
              ) : (
                disputes.map((d) => (
                  <DisputeRow key={d.id} dispute={d} onResolve={handleResolveDispute} />
                ))
              )}
            </div>
          )}

          {/* ── Workers Tab ── */}
          {activeTab === "workers" && (
            <div className="space-y-4">
              {/* Grade filter pills */}
              <div className="flex gap-2 flex-wrap">
                {(["all", "A", "B", "C"] as const).map((g) => (
                  <button
                    key={g}
                    onClick={async () => {
                      setLoading(true);
                      try {
                        const data = await getAdminWorkers({
                          grade: g === "all" ? undefined : g,
                          limit: 100,
                        });
                        setWorkers(data.workers);
                      } finally {
                        setLoading(false);
                      }
                    }}
                    className={`px-3 py-1.5 text-sm rounded-lg font-medium transition-colors ${
                      g === "A"
                        ? "bg-amber-100 text-amber-800 hover:bg-amber-200"
                        : g === "B"
                        ? "bg-indigo-100 text-indigo-800 hover:bg-indigo-200"
                        : g === "C"
                        ? "bg-slate-100 text-slate-700 hover:bg-slate-200"
                        : "bg-white border border-slate-200 text-slate-700 hover:bg-slate-50"
                    }`}
                  >
                    {g === "all" ? "ทั้งหมด" : `Grade ${g}`}
                    {g === "A" && (
                      <span className="ml-1 text-[10px] opacity-75">VVIP</span>
                    )}
                  </button>
                ))}
                <span className="text-xs text-slate-400 self-center ml-1">
                  {workers.length} คน
                </span>
              </div>

              <WorkerGradeTable
                workers={workers}
                onBan={(id, name) => setBanTarget({ id, name })}
                onLift={handleLiftBan}
              />
            </div>
          )}
        </>
      )}

      {/* Shadow Ban modal */}
      <BanModal
        target={banTarget}
        onConfirm={handleShadowBan}
        onCancel={() => setBanTarget(null)}
      />
    </div>
  );
};

