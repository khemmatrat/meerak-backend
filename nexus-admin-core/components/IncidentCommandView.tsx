/**
 * IncidentCommandView.tsx — Nexus Admin Core
 * ─────────────────────────────────────────────────────────────────────
 * Incident Command Center: จัดการเหตุฉุกเฉินที่ผู้รับงานรายงาน
 *
 * Features:
 *  • Incident Cards เรียงตามความด่วน (pending ก่อน)
 *  • Detail panel: worker info + evidence photos + client info
 *  • [Find Replacement] → ลิสต์ worker ที่ว่าง + Assign ทันที
 *  • [Full Refund & Close] → คืนเงิน ปิดงาน
 *  • [Mark as Fraud] → ลงโทษผู้รับงาน
 */

import React, { useEffect, useState, useCallback } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Users,
  RefreshCw,
  Star,
  Briefcase,
  Phone,
  Mail,
  Image as ImageIcon,
  ShieldBan,
  ChevronRight,
  Clock,
  User,
  Crown,
  Loader2,
} from "lucide-react";
import {
  getIncidents,
  resolveIncident,
  findReplacementWorkers,
  getAdminToken,
  type IncidentRow,
  type ReplacementWorker,
} from "../services/adminApi";

// ── Incident type labels ────────────────────────────────────────────────

const INCIDENT_LABELS: Record<string, { label: string; emoji: string; urgency: number }> = {
  accident:         { label: "อุบัติเหตุ",               emoji: "🚑", urgency: 5 },
  illness:          { label: "เจ็บป่วยกะทันหัน",         emoji: "🤒", urgency: 4 },
  vehicle_issue:    { label: "รถเสีย",                    emoji: "🚗", urgency: 3 },
  family_emergency: { label: "เหตุฉุกเฉินครอบครัว",       emoji: "👨‍👩‍👧", urgency: 4 },
  natural_disaster: { label: "ภัยธรรมชาติ",               emoji: "🌊", urgency: 5 },
  other:            { label: "เหตุสุดวิสัย",              emoji: "⚠️", urgency: 2 },
};

const urgencyColor = (type: string): string => {
  const u = INCIDENT_LABELS[type]?.urgency || 2;
  if (u >= 5) return "border-red-500 bg-red-50";
  if (u >= 4) return "border-orange-400 bg-orange-50";
  return "border-amber-300 bg-amber-50";
};

const urgencyBadge = (type: string): string => {
  const u = INCIDENT_LABELS[type]?.urgency || 2;
  if (u >= 5) return "bg-red-600 text-white";
  if (u >= 4) return "bg-orange-500 text-white";
  return "bg-amber-400 text-white";
};

// ── Star row ────────────────────────────────────────────────────────────

const StarRow: React.FC<{ value: number }> = ({ value }) => (
  <span className="flex items-center gap-0.5">
    {Array.from({ length: 5 }).map((_, i) => (
      <Star key={i} size={11}
        className={i < Math.round(value) ? "text-amber-400 fill-amber-400" : "text-slate-200"} />
    ))}
    <span className="ml-1 text-xs text-slate-500">{Number(value).toFixed(1)}</span>
  </span>
);

// ── Time ago helper ─────────────────────────────────────────────────────

function timeAgo(dateStr: string): string {
  const diff = (Date.now() - new Date(dateStr).getTime()) / 1000;
  if (diff < 60)   return `${Math.round(diff)} วินาทีที่แล้ว`;
  if (diff < 3600) return `${Math.round(diff / 60)} นาทีที่แล้ว`;
  if (diff < 86400) return `${Math.round(diff / 3600)} ชั่วโมงที่แล้ว`;
  return `${Math.round(diff / 86400)} วันที่แล้ว`;
}

// ── Replacement worker modal ────────────────────────────────────────────

const ReplacementModal: React.FC<{
  incidentId: string;
  onAssign:   (workerId: string) => void;
  onClose:    () => void;
}> = ({ incidentId, onAssign, onClose }) => {
  const [workers, setWorkers] = useState<ReplacementWorker[]>([]);
  const [loading, setLoading] = useState(true);
  const [assigning, setAssigning] = useState<string | null>(null);

  useEffect(() => {
    findReplacementWorkers(incidentId)
      .then((r) => setWorkers(r.workers))
      .catch(() => setWorkers([]))
      .finally(() => setLoading(false));
  }, [incidentId]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden">
        <div className="bg-indigo-600 px-5 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2 text-white">
            <Users size={20} />
            <h3 className="font-bold">หาผู้รับงานทดแทน</h3>
          </div>
          <button onClick={onClose} className="text-indigo-200 hover:text-white">
            <XCircle size={20} />
          </button>
        </div>

        <div className="p-5 max-h-96 overflow-y-auto space-y-3">
          {loading ? (
            <div className="py-8 text-center">
              <Loader2 size={28} className="animate-spin text-indigo-500 mx-auto" />
              <p className="text-sm text-slate-500 mt-2">กำลังค้นหา...</p>
            </div>
          ) : workers.length === 0 ? (
            <div className="py-8 text-center text-slate-400 text-sm">
              ไม่พบผู้รับงานที่ว่างในขณะนี้
            </div>
          ) : (
            workers.map((w) => (
              <div key={w.id} className="flex items-center gap-3 p-3 border border-slate-200 rounded-xl hover:border-indigo-300 transition-colors">
                {w.profile_image_url ? (
                  <img src={w.profile_image_url} alt={w.full_name}
                    className="w-10 h-10 rounded-full object-cover border border-slate-200" />
                ) : (
                  <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center">
                    <User size={18} className="text-slate-400" />
                  </div>
                )}
                <div className="flex-1">
                  <p className="font-semibold text-slate-800 text-sm">{w.full_name}</p>
                  <StarRow value={w.avg_rating || 0} />
                  <div className="flex gap-3 mt-0.5 text-xs text-slate-500">
                    <span>{w.total_jobs} งาน</span>
                    <span>{Number(w.success_rate || 0).toFixed(0)}% สำเร็จ</span>
                  </div>
                </div>
                {w.worker_grade && (
                  <span
                    className={`text-[11px] font-bold px-2 py-0.5 rounded-full text-white ${
                      w.worker_grade === "A"
                        ? "bg-amber-500"
                        : w.worker_grade === "B"
                        ? "bg-indigo-500"
                        : "bg-slate-500"
                    }`}
                  >
                    {w.worker_grade}
                  </span>
                )}
                <button
                  disabled={!!assigning}
                  onClick={async () => {
                    setAssigning(w.id);
                    await onAssign(w.id);
                  }}
                  className="flex items-center gap-1 text-xs bg-indigo-600 text-white px-3 py-1.5 rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors font-semibold"
                >
                  {assigning === w.id ? (
                    <Loader2 size={12} className="animate-spin" />
                  ) : (
                    <>Assign <ChevronRight size={12} /></>
                  )}
                </button>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};

// ── Incident detail panel ───────────────────────────────────────────────

const IncidentDetail: React.FC<{
  incident:   IncidentRow;
  onReroute:  () => void;
  onRefund:   () => void;
  onFraud:    () => void;
  processing: boolean;
}> = ({ incident, onReroute, onRefund, onFraud, processing }) => {
  const typeInfo = INCIDENT_LABELS[incident.type] || { label: incident.type, emoji: "⚠️" };
  const images = Array.isArray(incident.evidence_images) ? incident.evidence_images : [];
  const isResolved = incident.resolution_status !== "pending";

  return (
    <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden h-full flex flex-col">
      {/* Header */}
      <div className={`px-5 py-4 border-b ${isResolved ? "border-slate-100 bg-slate-50" : "border-red-100 bg-red-50"}`}>
        <div className="flex items-center gap-2 mb-1">
          <span className="text-2xl">{typeInfo.emoji}</span>
          <h3 className="font-bold text-slate-900">{typeInfo.label}</h3>
          <span className={`ml-auto text-xs px-2 py-0.5 rounded-full font-bold ${
            incident.resolution_status === "pending"  ? "bg-red-100 text-red-700" :
            incident.resolution_status === "resolved" ? "bg-emerald-100 text-emerald-700" :
            "bg-slate-200 text-slate-600"
          }`}>
            {incident.resolution_status === "pending" ? "รอดำเนินการ" :
             incident.resolution_status === "resolved" ? "แก้ไขแล้ว" : "Fraud"}
          </span>
        </div>
        <p className="text-xs text-slate-500 flex items-center gap-1">
          <Clock size={11} /> {timeAgo(incident.reported_at)}
          {incident.job_title && <> &nbsp;•&nbsp; งาน: {incident.job_title}</>}
        </p>
      </div>

      <div className="flex-1 overflow-y-auto p-5 space-y-5">
        {/* Worker + Client */}
        <div className="grid sm:grid-cols-2 gap-4">
          <div className="bg-slate-50 rounded-xl p-4 border border-slate-100">
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">
              ผู้รับงาน
            </p>
            <div className="flex items-center gap-3">
              {incident.worker_avatar ? (
                <img src={incident.worker_avatar} alt={incident.worker_name}
                  className="w-10 h-10 rounded-full object-cover border border-slate-200" />
              ) : (
                <div className="w-10 h-10 rounded-full bg-slate-200 flex items-center justify-center">
                  <User size={18} className="text-slate-400" />
                </div>
              )}
              <div>
                <p className="font-semibold text-slate-800 text-sm">{incident.worker_name}</p>
                {incident.worker_grade && (
                  <span className={`text-[11px] font-bold px-1.5 py-0.5 rounded text-white ${
                    incident.worker_grade === "A" ? "bg-amber-500" :
                    incident.worker_grade === "B" ? "bg-indigo-500" : "bg-slate-500"
                  }`}>
                    Grade {incident.worker_grade}
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="bg-slate-50 rounded-xl p-4 border border-slate-100">
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">
              ลูกค้าที่ได้รับผลกระทบ
            </p>
            <p className="font-semibold text-slate-800 text-sm">{incident.client_name || "—"}</p>
            {incident.client_email && (
              <p className="text-xs text-slate-500 flex items-center gap-1 mt-0.5">
                <Mail size={11} /> {incident.client_email}
              </p>
            )}
            {incident.job_price && (
              <p className="text-xs text-slate-500 mt-0.5">
                💰 มูลค่างาน: ฿{Number(incident.job_price).toLocaleString()}
              </p>
            )}
          </div>
        </div>

        {/* Description */}
        {incident.description && (
          <div>
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5">
              รายละเอียด
            </p>
            <p className="text-sm text-slate-700 bg-slate-50 rounded-xl p-3 border border-slate-100">
              {incident.description}
            </p>
          </div>
        )}

        {/* Evidence images */}
        <div>
          <p className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">
            หลักฐานภาพถ่าย
          </p>
          {images.length > 0 ? (
            <div className="grid grid-cols-3 gap-2">
              {images.map((img, i) => (
                <a key={i} href={img} target="_blank" rel="noopener noreferrer"
                  className="aspect-square rounded-xl overflow-hidden border border-slate-200 hover:opacity-90 transition-opacity">
                  <img src={img} alt={`evidence-${i}`} className="w-full h-full object-cover" />
                </a>
              ))}
            </div>
          ) : (
            <p className="text-sm text-slate-400 flex items-center gap-1.5">
              <ImageIcon size={14} /> ไม่มีรูปหลักฐาน
            </p>
          )}
        </div>

        {/* Resolution notes if resolved */}
        {isResolved && incident.resolution_notes && (
          <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3">
            <p className="text-xs font-bold text-emerald-700 mb-1">ผลการดำเนินการ</p>
            <p className="text-sm text-slate-700">{incident.resolution_notes}</p>
          </div>
        )}
      </div>

      {/* Action buttons */}
      {!isResolved && (
        <div className="p-4 border-t border-slate-100 space-y-2">
          <button
            onClick={onReroute}
            disabled={processing}
            className="w-full flex items-center justify-center gap-2 py-2.5 bg-indigo-600 text-white font-bold text-sm rounded-xl hover:bg-indigo-700 disabled:opacity-50 transition-colors"
          >
            <Users size={15} />
            Find Replacement
          </button>
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={onRefund}
              disabled={processing}
              className="flex items-center justify-center gap-1.5 py-2.5 bg-amber-500 text-white font-bold text-sm rounded-xl hover:bg-amber-600 disabled:opacity-50 transition-colors"
            >
              <CheckCircle2 size={14} />
              Full Refund & Close
            </button>
            <button
              onClick={onFraud}
              disabled={processing}
              className="flex items-center justify-center gap-1.5 py-2.5 bg-slate-800 text-white font-bold text-sm rounded-xl hover:bg-slate-900 disabled:opacity-50 transition-colors"
            >
              <ShieldBan size={14} />
              Mark as Fraud
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

// ── Main Component ──────────────────────────────────────────────────────

export const IncidentCommandView: React.FC = () => {
  const [incidents,        setIncidents]       = useState<IncidentRow[]>([]);
  const [selected,         setSelected]         = useState<IncidentRow | null>(null);
  const [loading,          setLoading]          = useState(false);
  const [processing,       setProcessing]       = useState(false);
  const [showReplacement,  setShowReplacement]  = useState(false);
  const [statusFilter,     setStatusFilter]     = useState<"pending" | "resolved" | "all">("pending");
  const [toast,            setToast]            = useState<string | null>(null);
  const hasToken = !!getAdminToken();

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  };

  const loadData = useCallback(async () => {
    if (!hasToken) return;
    setLoading(true);
    try {
      const data = await getIncidents({ status: statusFilter, limit: 50 });
      // เรียงตาม urgency (type) แล้วตาม reported_at
      const sorted = [...data.incidents].sort((a, b) => {
        const ua = INCIDENT_LABELS[a.type]?.urgency || 2;
        const ub = INCIDENT_LABELS[b.type]?.urgency || 2;
        if (ub !== ua) return ub - ua;
        return new Date(a.reported_at).getTime() - new Date(b.reported_at).getTime();
      });
      setIncidents(sorted);
      if (sorted.length > 0 && !selected) setSelected(sorted[0]);
    } catch (err) {
      console.error("[IncidentCommandView] load:", err);
    } finally {
      setLoading(false);
    }
  }, [statusFilter, hasToken]);

  useEffect(() => { loadData(); }, [loadData]);

  // ── Resolve handlers ─────────────────────────────────────────────

  const handleAction = async (
    action: "reroute" | "refund_close" | "mark_fraud",
    replacementWorkerId?: string
  ) => {
    if (!selected) return;
    setProcessing(true);
    try {
      await resolveIncident(selected.id, action, replacementWorkerId);
      const toastMsg =
        action === "reroute"       ? "✅ มอบหมายคนแทนสำเร็จ" :
        action === "refund_close"  ? "💰 คืนเงินและปิดงานแล้ว" :
        "🚫 บันทึก Fraud แล้ว";
      showToast(toastMsg);
      setShowReplacement(false);
      // Update local state
      setIncidents((prev) =>
        prev.map((i) =>
          i.id === selected.id ? { ...i, resolution_status: "resolved" } : i
        )
      );
      setSelected((prev) =>
        prev ? { ...prev, resolution_status: "resolved" } : null
      );
      // Auto-select next pending
      setTimeout(() => {
        const nextPending = incidents.find(
          (i) => i.id !== selected.id && i.resolution_status === "pending"
        );
        if (nextPending) setSelected(nextPending);
      }, 500);
    } catch (err: any) {
      showToast(`❌ เกิดข้อผิดพลาด: ${err.message}`);
    } finally {
      setProcessing(false);
    }
  };

  if (!hasToken) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-slate-400 gap-3">
        <AlertTriangle size={40} className="text-slate-300" />
        <p className="text-sm">กรุณา Login ด้วยบัญชี Admin</p>
      </div>
    );
  }

  const pendingCount = incidents.filter((i) => i.resolution_status === "pending").length;

  return (
    <div className="flex flex-col h-full gap-4">
      {/* Toast */}
      {toast && (
        <div className="fixed top-4 right-4 z-50 bg-slate-900 text-white text-sm font-medium px-4 py-2.5 rounded-xl shadow-2xl">
          {toast}
        </div>
      )}

      {/* Stats + controls */}
      <div className="flex items-center gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <div className={`flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-bold ${
            pendingCount > 0 ? "bg-red-100 text-red-700" : "bg-slate-100 text-slate-600"
          }`}>
            <AlertTriangle size={15} />
            {pendingCount} รอดำเนินการ
          </div>
        </div>

        {/* Status filter */}
        <div className="flex gap-1 bg-slate-100 p-1 rounded-xl">
          {(["pending", "resolved", "all"] as const).map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
                statusFilter === s
                  ? "bg-white text-slate-900 shadow-sm"
                  : "text-slate-500 hover:text-slate-700"
              }`}
            >
              {s === "pending" ? "รอดำเนินการ" : s === "resolved" ? "เสร็จสิ้น" : "ทั้งหมด"}
            </button>
          ))}
        </div>

        <button
          onClick={loadData}
          disabled={loading}
          className="ml-auto flex items-center gap-2 text-sm bg-white border border-slate-200 text-slate-700 px-3 py-2 rounded-xl hover:bg-slate-50 transition-colors"
        >
          <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
          รีเฟรช
        </button>
      </div>

      {/* Main layout: list + detail */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-5 gap-4 min-h-0">
        {/* Incident list */}
        <div className="lg:col-span-2 space-y-2 overflow-y-auto">
          {loading ? (
            Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-24 bg-slate-100 rounded-xl animate-pulse" />
            ))
          ) : incidents.length === 0 ? (
            <div className="text-center py-12 text-slate-400 text-sm">
              <CheckCircle2 size={32} className="mx-auto mb-2 text-emerald-400" />
              ไม่มีเหตุฉุกเฉิน
            </div>
          ) : (
            incidents.map((inc) => {
              const typeInfo = INCIDENT_LABELS[inc.type] || { label: inc.type, emoji: "⚠️" };
              const isSelected = selected?.id === inc.id;
              const isPending = inc.resolution_status === "pending";

              return (
                <button
                  key={inc.id}
                  onClick={() => setSelected(inc)}
                  className={`w-full text-left p-4 rounded-xl border-2 transition-all ${
                    isSelected
                      ? "border-indigo-500 bg-indigo-50 shadow-md"
                      : isPending
                      ? `${urgencyColor(inc.type)} hover:shadow-sm`
                      : "border-slate-200 bg-white hover:border-slate-300"
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <span className="text-2xl leading-none">{typeInfo.emoji}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <p className="font-bold text-slate-800 text-sm truncate">
                          {inc.worker_name}
                        </p>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${urgencyBadge(inc.type)}`}>
                          {typeInfo.label}
                        </span>
                      </div>
                      <p className="text-xs text-slate-500 truncate">
                        {inc.job_title || inc.job_id}
                      </p>
                      <p className="text-xs text-slate-400 mt-0.5 flex items-center gap-1">
                        <Clock size={10} /> {timeAgo(inc.reported_at)}
                      </p>
                    </div>
                    {inc.resolution_status === "pending" ? (
                      <div className="w-2.5 h-2.5 rounded-full bg-red-500 mt-1 shrink-0 animate-pulse" />
                    ) : (
                      <CheckCircle2 size={16} className="text-emerald-500 shrink-0 mt-0.5" />
                    )}
                  </div>
                </button>
              );
            })
          )}
        </div>

        {/* Detail panel */}
        <div className="lg:col-span-3">
          {selected ? (
            <IncidentDetail
              incident={selected}
              processing={processing}
              onReroute={() => setShowReplacement(true)}
              onRefund={() => handleAction("refund_close")}
              onFraud={() => {
                if (confirm(`ยืนยันว่ารายงานของ ${selected.worker_name} เป็นเท็จ?\nผู้รับงานจะถูก Shadow Ban และลดเกรด`)) {
                  handleAction("mark_fraud");
                }
              }}
            />
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-slate-400 border-2 border-dashed border-slate-200 rounded-2xl">
              <Briefcase size={36} className="mb-2 text-slate-300" />
              <p className="text-sm">เลือก Incident เพื่อดูรายละเอียด</p>
            </div>
          )}
        </div>
      </div>

      {/* Replacement Modal */}
      {showReplacement && selected && (
        <ReplacementModal
          incidentId={selected.id}
          onAssign={async (workerId) => {
            await handleAction("reroute", workerId);
          }}
          onClose={() => setShowReplacement(false)}
        />
      )}
    </div>
  );
};
