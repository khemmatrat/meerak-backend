/**
 * Phase 4B: KYC Review — list submissions, view detail, approve/reject.
 * All decisions are logged in financial_audit_log (backend).
 * แสดงรูปเอกสารแบบ thumbnail + คลิก popup ดูขนาดเต็ม ป้องกันเอกสารปลอม
 */
import React, { useState, useEffect } from "react";
import {
  Eye,
  CheckCircle,
  XCircle,
  FileText,
  Loader2,
  X,
  ShieldCheck,
  Expand,
  RefreshCw,
} from "lucide-react";
import {
  getKycSubmissions,
  getKycDetail,
  approveKyc,
  rejectKyc,
  requestKycResubmit,
  requestKycSupplement,
  getKycOverview,
  getAdminToken,
  type KycSubmissionRow,
  type KycDetailResponse,
  type KycOverviewResponse,
} from "../services/adminApi";
import {
  KYC_MESSAGE_TEMPLATES_REJECT,
  KYC_MESSAGE_TEMPLATES_RESUBMIT,
} from "../constants/kycMessageTemplates";

interface KycReviewViewProps {
  /** When set, open this user's KYC detail automatically (e.g. from User Management) */
  preSelectUserId?: string | null;
  /** Call after using preSelectUserId so it is not applied again */
  onClearPreSelect?: () => void;
}

function parseVehiclesJson(raw: unknown): any[] {
  if (Array.isArray(raw)) return raw;
  if (typeof raw === "string" && raw.trim()) {
    try {
      const p = JSON.parse(raw);
      return Array.isArray(p) ? p : [];
    } catch {
      return [];
    }
  }
  return [];
}

function isDeliveryPartnerIntent(doc: Record<string, unknown> | undefined): boolean {
  const addr = String(doc?.address || "");
  const vehicles = JSON.stringify(doc?.vehicles_json || "");
  return (
    addr.includes("AQOND แอปไรเดอร์") ||
    vehicles.includes("aqond_delivery") ||
    vehicles.includes("aqond_storefront")
  );
}

function deliveryPartnerMeta(doc: Record<string, unknown> | undefined) {
  const v = parseVehiclesJson(doc?.vehicles_json)[0] || {};
  return {
    plate: v.license_plate || "",
    bank: v.bank_account || "",
    vehicle: v.vehicle_type || "",
    dispatchId: v.dispatch_rider_id || "",
  };
}

function vehicleRegistrationThumbnails(d: Record<string, unknown>): Array<{
  url: string;
  label: string;
  type: "image" | "video";
}> {
  const items: Array<{ url: string; label: string; type: "image" | "video" }> =
    [];
  parseVehiclesJson(d?.vehicles_json).forEach((v: any, idx: number) => {
    const url = v?.registration_book_photo_url;
    if (url && typeof url === "string") {
      items.push({
        url,
        label: `เล่มทะเบียน (คันที่ ${idx + 1})`,
        type: "image",
      });
    }
  });
  return items;
}

type DocSlot = {
  id: string;
  label: string;
  uploaded: boolean;
  optional?: boolean;
};

function buildDocumentInventory(latest: Record<string, unknown> | undefined): {
  slots: DocSlot[];
  vehicles: Array<{ label: string; uploaded: boolean; detail: string }>;
  wantsPublicTransport: boolean;
} {
  const d = latest || {};
  const vehicles = parseVehiclesJson(d.vehicles_json);
  const wantsPublicTransport = !!d.wants_public_transport;

  const slots: DocSlot[] = [
    {
      id: "id_card_front_url",
      label: "บัตรประชาชน (หน้า)",
      uploaded: !!d.id_card_front_url,
    },
    {
      id: "id_card_back_url",
      label: "บัตรประชาชน (หลัง)",
      uploaded: !!d.id_card_back_url,
    },
    {
      id: "selfie_photo_url",
      label: "รูปถ่ายใบหน้า",
      uploaded: !!d.selfie_photo_url,
    },
    {
      id: "driving_license_front_url",
      label: "ใบขับขี่ (หน้า)",
      uploaded: !!d.driving_license_front_url,
      optional: true,
    },
    {
      id: "driving_license_back_url",
      label: "ใบขับขี่ (หลัง)",
      uploaded: !!d.driving_license_back_url,
      optional: true,
    },
    {
      id: "vehicle_registration",
      label: "เล่มทะเบียนรถ / รูปรถ",
      uploaded: vehicles.some((v) => v?.registration_book_photo_url),
      optional: true,
    },
    {
      id: "yellow_plate_photo_url",
      label: "ป้ายเหลือง (รถสาธารณะ)",
      uploaded: !!d.yellow_plate_photo_url,
      optional: !wantsPublicTransport,
    },
    {
      id: "public_transport_license_front_url",
      label: "ใบขับขี่สาธารณะ (หน้า)",
      uploaded: !!d.public_transport_license_front_url,
      optional: !wantsPublicTransport,
    },
    {
      id: "public_transport_license_back_url",
      label: "ใบขับขี่สาธารณะ (หลัง)",
      uploaded: !!d.public_transport_license_back_url,
      optional: true,
    },
  ];

  const vehicleRows =
    vehicles.length > 0
      ? vehicles.map((v: any, idx: number) => ({
          label: `รถคันที่ ${idx + 1}`,
          uploaded: !!v?.registration_book_photo_url,
          detail: [v.license_plate, v.vehicle_province, v.vehicle_brand]
            .filter(Boolean)
            .join(" "),
        }))
      : [
          {
            label: "ทะเบียนรถ",
            uploaded: false,
            detail: "ผู้ใช้ยังไม่ได้เพิ่มข้อมูลรถ",
          },
        ];

  return { slots, vehicles: vehicleRows, wantsPublicTransport };
}

function closeKycDetail(
  setDetail: (v: KycDetailResponse | null) => void,
  setDetailUserId: (v: string | null) => void,
) {
  setDetail(null);
  setDetailUserId(null);
}

export const KycReviewView: React.FC<KycReviewViewProps> = ({
  preSelectUserId = null,
  onClearPreSelect,
}) => {
  const [submissions, setSubmissions] = useState<KycSubmissionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [detail, setDetail] = useState<KycDetailResponse | null>(null);
  const [detailUserId, setDetailUserId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [resubmitDeadline, setResubmitDeadline] = useState("");
  const [requiredStepsText, setRequiredStepsText] = useState("");
  const [processing, setProcessing] = useState(false);
  const [lightbox, setLightbox] = useState<{
    url: string;
    label: string;
    type: "image" | "video";
  } | null>(null);
  const [overview, setOverview] = useState<KycOverviewResponse | null>(null);
  const [showSubmissionHistory, setShowSubmissionHistory] = useState(false);
  const useBackend = !!getAdminToken();

  const fetchOverview = async () => {
    if (!useBackend) return;
    try {
      const o = await getKycOverview();
      setOverview(o);
    } catch {
      setOverview(null);
    }
  };

  useEffect(() => {
    void fetchOverview();
  }, [useBackend]);

  useEffect(() => {
    const onEsc = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (lightbox) {
        setLightbox(null);
        return;
      }
      if (detail) {
        closeKycDetail(setDetail, setDetailUserId);
      }
    };
    window.addEventListener("keydown", onEsc);
    return () => window.removeEventListener("keydown", onEsc);
  }, [lightbox, detail]);

  const DOC_LABELS: Record<string, string> = {
    id_card_front_url: "บัตรประชาชน (หน้า)",
    id_card_back_url: "บัตรประชาชน (หลัง)",
    selfie_photo_url: "รูปถ่ายใบหน้า",
    driving_license_front_url: "ใบขับขี่ (หน้า)",
    driving_license_back_url: "ใบขับขี่ (หลัง)",
    selfie_video_url: "วิดีโอ Selfie",
    yellow_plate_photo_url: "ป้ายเหลือง (รถสาธารณะ)",
    public_transport_license_front_url: "ใบขับขี่สาธารณะ (หน้า)",
    public_transport_license_back_url: "ใบขับขี่สาธารณะ (หลัง)",
  };

  const fetchList = async () => {
    if (!useBackend) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const res = await getKycSubmissions({
        status: "pending,under_review",
        limit: 100,
      });
      setSubmissions(res.submissions || []);
    } catch (e) {
      console.error("KYC list error:", e);
      setSubmissions([]);
    }
    setLoading(false);
    void fetchOverview();
  };

  useEffect(() => {
    fetchList();
  }, [useBackend]);

  // When opened from User Management with a pre-selected user, open their KYC detail
  useEffect(() => {
    if (!useBackend || !preSelectUserId) return;
    getKycDetail(preSelectUserId)
      .then((res) => {
        setDetail(res);
        setDetailUserId(preSelectUserId);
        setRejectReason("");
        setResubmitDeadline("");
        setRequiredStepsText("");
        onClearPreSelect?.();
      })
      .catch(() => {
        onClearPreSelect?.();
        setTimeout(() => alert("No KYC submission found for this user."), 100);
      });
  }, [useBackend, preSelectUserId]);

  const openDetail = async (userId: string) => {
    try {
      const res = await getKycDetail(userId);
      setDetail(res);
      setDetailUserId(userId);
      setRejectReason("");
      setResubmitDeadline("");
      setRequiredStepsText("");
      setShowSubmissionHistory(false);
    } catch (e: any) {
      alert("Failed to load KYC detail: " + (e?.message || e));
    }
  };

  const handleApprove = async () => {
    if (!detailUserId) return;
    setProcessing(true);
    try {
      await approveKyc(detailUserId);
      alert("KYC approved; decision recorded in audit log.");
      setDetail(null);
      setDetailUserId(null);
      fetchList();
      void fetchOverview();
    } catch (e: any) {
      alert("Failed to approve: " + (e?.message || e));
    }
    setProcessing(false);
  };

  const handleReject = async () => {
    if (!detailUserId) return;
    setProcessing(true);
    try {
      await rejectKyc(detailUserId, rejectReason || undefined);
      alert("KYC rejected; decision recorded in audit log.");
      setDetail(null);
      setDetailUserId(null);
      setRejectReason("");
      setResubmitDeadline("");
      setRequiredStepsText("");
      fetchList();
      void fetchOverview();
    } catch (e: any) {
      alert("Failed to reject: " + (e?.message || e));
    }
    setProcessing(false);
  };

  const handleRequestResubmit = async () => {
    if (!detailUserId) return;
    const instruction =
      (rejectReason || "").trim() || "กรุณาส่งเอกสารยืนยันตัวตนใหม่";
    const deadline =
      resubmitDeadline && String(resubmitDeadline).trim()
        ? new Date(`${resubmitDeadline}T23:59:59`).toISOString()
        : null;
    const required_steps = requiredStepsText
      .split(/[\n,;]+/)
      .map((s) => s.trim())
      .filter(Boolean);

    setProcessing(true);
    try {
      await requestKycResubmit(detailUserId, {
        instruction,
        deadline,
        required_steps,
      });
      alert(
        "สั่งให้ผู้ใช้กรอกใหม่แล้ว (resubmission_required); บันทึกใน audit log.",
      );
      setDetail(null);
      setDetailUserId(null);
      setRejectReason("");
      setResubmitDeadline("");
      setRequiredStepsText("");
      fetchList();
      void fetchOverview();
    } catch (e: any) {
      alert("คำสั่งกรอกใหม่ล้มเหลว: " + (e?.message || e));
    }
    setProcessing(false);
  };

  const handleRequestPublicTransportSupplement = async () => {
    if (!detailUserId) return;
    const instruction =
      (rejectReason || "").trim() ||
      "กรุณาแนบรูปป้ายเหลืองและใบอนุญาตขับขี่สาธารณะ (ด้านหน้า) — ไม่ต้องกรอกข้อมูลส่วนตัวหรือบัตรประชาชนใหม่";
    const deadline =
      resubmitDeadline && String(resubmitDeadline).trim()
        ? new Date(`${resubmitDeadline}T23:59:59`).toISOString()
        : null;

    setProcessing(true);
    try {
      await requestKycSupplement(detailUserId, {
        instruction,
        deadline,
        requested_docs: [
          "yellow_plate",
          "public_transport_license_front",
          "public_transport_license_back",
        ],
      });
      alert(
        "สั่งให้ผู้ใช้ส่งเฉพาะเอกสารป้ายเหลือง/ใบขับขี่สาธารณะแล้ว (supplement_required) — ไม่ต้องกรอก KYC ใหม่ทั้งชุด",
      );
      setDetail(null);
      setDetailUserId(null);
      setRejectReason("");
      setResubmitDeadline("");
      setRequiredStepsText("");
      fetchList();
      void fetchOverview();
    } catch (e: any) {
      alert("ขอเอกสารเพิ่มล้มเหลว: " + (e?.message || e));
    }
    setProcessing(false);
  };

  if (!useBackend) {
    return (
      <div className="rounded-xl border border-slate-200 bg-slate-50 p-8 text-center text-slate-500">
        <ShieldCheck size={48} className="mx-auto mb-4 text-slate-400" />
        <p>KYC Review requires admin login (backend JWT).</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="bg-gradient-to-r from-indigo-600 to-purple-600 rounded-xl p-6 text-white">
        <h2 className="text-2xl font-bold mb-2">KYC Review</h2>
        <p className="text-indigo-100">
          List submissions, view detail, approve or reject. “สั่งกรอกใหม่”
          ตั้งสถานะ{" "}
          <code className="bg-white/10 px-1 rounded">
            resubmission_required
          </code>{" "}
          แยกจากปฏิเสธถาวร; ทุกการตัดสินใจบันทึกใน financial_audit_log.
        </p>
      </div>

      {overview && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="bg-white rounded-xl border border-slate-100 p-4 shadow-sm">
            <p className="text-xs text-slate-500 font-medium">
              รอตรวจ (ผู้ใช้)
            </p>
            <p className="text-2xl font-bold text-amber-700">
              {overview.pendingReviewUsers}
            </p>
          </div>
          <div className="bg-white rounded-xl border border-slate-100 p-4 shadow-sm">
            <p className="text-xs text-slate-500 font-medium">สั่งกรอกใหม่</p>
            <p className="text-2xl font-bold text-orange-700">
              {overview.resubmissionRequiredUsers}
            </p>
          </div>
          <div className="bg-white rounded-xl border border-slate-100 p-4 shadow-sm">
            <p className="text-xs text-slate-500 font-medium">ปฏิเสธถาวร</p>
            <p className="text-2xl font-bold text-rose-700">
              {overview.rejectedUsers}
            </p>
          </div>
          <div className="bg-white rounded-xl border border-rose-200 p-4 shadow-sm bg-rose-50/50">
            <p className="text-xs text-rose-700 font-medium">
              เลยกำหนดส่ง (SLA)
            </p>
            <p className="text-2xl font-bold text-rose-800">
              {overview.resubmissionDeadlineOverdue}
            </p>
          </div>
        </div>
      )}

      <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
          <h3 className="font-bold text-slate-800">
            Submissions (pending / under_review)
          </h3>
        </div>
        {loading ? (
          <div className="flex items-center justify-center h-48 text-slate-400">
            <Loader2 size={32} className="animate-spin" />
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-600">
              <tr>
                <th className="px-6 py-3 text-left font-semibold">User</th>
                <th className="px-6 py-3 text-left font-semibold">Status</th>
                <th className="px-6 py-3 text-left font-semibold">Docs</th>
                <th className="px-6 py-3 text-right font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {submissions.map((s) => (
                <tr key={s.id} className="hover:bg-slate-50/50">
                  <td className="px-6 py-4">
                    <p className="font-medium text-slate-900">
                      {s.full_name || s.email}
                    </p>
                    <p className="text-xs text-slate-500">{s.email}</p>
                  </td>
                  <td className="px-6 py-4">
                    <span className="px-2 py-1 rounded text-xs font-medium bg-amber-100 text-amber-800">
                      {s.kyc_status}
                      {(s as any).kyc_resubmit_trigger === "id_expired" && (
                        <span className="ml-1 text-[10px] font-semibold text-amber-700 bg-amber-100 px-1.5 py-0.5 rounded">
                          บัตรหมดอายุ
                        </span>
                      )}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    {s.doc_count} total, {s.pending_docs} pending
                  </td>
                  <td className="px-6 py-4 text-right">
                    <button
                      onClick={() => openDetail(s.id)}
                      className="text-indigo-600 hover:bg-indigo-50 px-3 py-1.5 rounded-lg text-xs font-medium"
                    >
                      <Eye size={14} className="inline mr-1" /> View
                    </button>
                  </td>
                </tr>
              ))}
              {submissions.length === 0 && (
                <tr>
                  <td
                    colSpan={4}
                    className="px-6 py-12 text-center text-slate-400"
                  >
                    No pending KYC submissions
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>

      {detail && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 overflow-y-auto"
          onClick={() => closeKycDetail(setDetail, setDetailUserId)}
          role="presentation"
        >
          <div
            className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[92vh] flex flex-col my-8"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-center gap-3 p-6 pb-4 border-b border-slate-100 shrink-0">
              <h3 className="text-xl font-bold text-slate-900 flex items-center gap-2">
                <FileText size={24} className="text-indigo-600" /> KYC Detail
              </h3>
              <button
                type="button"
                onClick={() => closeKycDetail(setDetail, setDetailUserId)}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-slate-200 bg-white text-slate-700 text-sm font-semibold hover:bg-slate-50 shadow-sm"
              >
                <X size={18} /> ปิดหน้าต่าง
              </button>
            </div>
            <div className="overflow-y-auto flex-1 p-6 pt-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                <div className="bg-slate-50 p-4 rounded-lg">
                  <p className="text-xs text-slate-500">Name</p>
                  <p className="font-bold text-slate-900">
                    {(detail.user as any).full_name ||
                      (detail.user as any).email}
                  </p>
                </div>
                <div className="bg-slate-50 p-4 rounded-lg">
                  <p className="text-xs text-slate-500">Email</p>
                  <p className="font-bold text-slate-900">
                    {(detail.user as any).email}
                  </p>
                </div>
                <div className="bg-slate-50 p-4 rounded-lg">
                  <p className="text-xs text-slate-500">KYC Status</p>
                  <p className="font-bold text-slate-900">
                    {(detail.user as any).kyc_status}
                  </p>
                </div>
                <div className="bg-slate-50 p-4 rounded-lg">
                  <p className="text-xs text-slate-500">Documents</p>
                  <p className="font-bold text-slate-900">
                    {detail.documents?.length || 0}
                  </p>
                </div>
              </div>
              {(() => {
                const latest = detail.documents?.[0] as
                  | Record<string, unknown>
                  | undefined;
                if (!isDeliveryPartnerIntent(latest)) return null;
                const meta = deliveryPartnerMeta(latest);
                return (
                  <div className="mb-6 rounded-xl border border-emerald-200 bg-emerald-50 p-4">
                    <p className="text-sm font-bold text-emerald-900">
                      สมัครผู้ให้บริการส่ง (AQOND แอปไรเดอร์)
                    </p>
                    <p className="mt-2 text-sm text-emerald-800">
                      ทะเบียน: {meta.plate || "—"} · ยานพาหนะ:{" "}
                      {meta.vehicle || "—"}
                    </p>
                    <p className="text-sm text-emerald-800">
                      บัญชีรับเงิน: {meta.bank || "—"}
                    </p>
                    {meta.dispatchId ? (
                      <p className="mt-1 text-xs text-emerald-700">
                        dispatch_rider_id: {meta.dispatchId}
                      </p>
                    ) : null}
                    <p className="mt-2 text-xs text-emerald-700">
                      เอกสารบัตร/ใบขับขี่อาจยังไม่ครบ — ตรวจสอบและอนุมัติตามนโยบาย KYC
                    </p>
                  </div>
                );
              })()}
              {(() => {
                const latest = detail.documents?.[0] as
                  | Record<string, unknown>
                  | undefined;
                const inv = buildDocumentInventory(latest);
                return (
                  <div className="mb-6 rounded-lg border border-slate-200 bg-slate-50/80 p-4">
                    <p className="text-xs font-bold text-slate-600 uppercase mb-3">
                      สถานะเอกสาร (รุ่นล่าสุด)
                    </p>
                    <p className="text-xs text-slate-500 mb-3">
                      แสดงเฉพาะรูปที่ผู้ใช้อัปโลดแล้ว — ช่องที่ขึ้น{" "}
                      <span className="text-amber-700 font-medium">
                        ยังไม่ส่ง
                      </span>{" "}
                      คือ user ยังไม่ได้แนบ (หรือส่ง KYC ก่อนมีฟีเจอร์รถสาธารณะ)
                    </p>
                    <ul className="space-y-1.5 text-sm">
                      {inv.slots.map((s) => (
                        <li
                          key={s.id}
                          className="flex items-center justify-between gap-2"
                        >
                          <span className="text-slate-700">
                            {s.label}
                            {s.optional &&
                            !inv.wantsPublicTransport &&
                            s.id.startsWith("public_") ? null : s.optional ? (
                              <span className="text-slate-400 text-xs ml-1">
                                (ไม่บังคับ)
                              </span>
                            ) : null}
                          </span>
                          <span
                            className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                              s.uploaded
                                ? "bg-emerald-100 text-emerald-800"
                                : s.optional
                                  ? "bg-slate-100 text-slate-500"
                                  : "bg-amber-100 text-amber-800"
                            }`}
                          >
                            {s.uploaded ? "ส่งแล้ว" : "ยังไม่ส่ง"}
                          </span>
                        </li>
                      ))}
                    </ul>
                    {inv.wantsPublicTransport && (
                      <p className="mt-3 text-xs font-medium text-amber-800 bg-amber-50 border border-amber-100 rounded px-2 py-1.5">
                        ผู้ใช้ระบุว่าต้องการขับรถสาธารณะ (ป้ายเหลือง)
                      </p>
                    )}
                    {inv.vehicles.length > 0 && (
                      <div className="mt-3 pt-3 border-t border-slate-200">
                        <p className="text-xs font-bold text-slate-500 mb-2">
                          ข้อมูลรถ
                        </p>
                        <ul className="space-y-1 text-xs text-slate-700">
                          {inv.vehicles.map((v, i) => (
                            <li key={i} className="flex justify-between gap-2">
                              <span>
                                {v.label}: {v.detail || "—"}
                              </span>
                              <span
                                className={
                                  v.uploaded
                                    ? "text-emerald-700"
                                    : "text-slate-400"
                                }
                              >
                                {v.uploaded ? "มีรูปเล่ม" : "ไม่มีรูป"}
                              </span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                );
              })()}
              {(() => {
                const latest = detail.documents?.[0] as
                  | Record<string, unknown>
                  | undefined;
                if (!latest) return null;
                const addr = latest.address;
                const vehicles = parseVehiclesJson(latest.vehicles_json);
                const hasAddr = typeof addr === "string" && addr.trim();
                if (!hasAddr && vehicles.length === 0) return null;
                return (
                  <div className="mb-6 space-y-4">
                    {hasAddr && (
                      <div className="p-4 rounded-lg bg-slate-50 border border-slate-100">
                        <p className="text-xs font-bold text-slate-500 mb-1">
                          ที่อยู่ (จากใบสมัครล่าสุด)
                        </p>
                        <p className="text-sm text-slate-800 whitespace-pre-wrap">
                          {String(addr).trim()}
                        </p>
                      </div>
                    )}
                    {vehicles.length > 0 && (
                      <div className="p-4 rounded-lg bg-amber-50/90 border border-amber-100">
                        <p className="text-xs font-bold text-amber-900 mb-2">
                          ทะเบียนรถ / ข้อมูลเล่ม (ผู้สมัคร Driver)
                        </p>
                        <ul className="space-y-2 text-sm text-slate-800">
                          {vehicles.map((v: any, idx: number) => (
                            <li
                              key={idx}
                              className="border-b border-amber-100/80 pb-2 last:border-0 last:pb-0"
                            >
                              <span className="font-medium">
                                คันที่ {idx + 1}:
                              </span>{" "}
                              {[v.license_plate, v.vehicle_province]
                                .filter(Boolean)
                                .join(" ")}
                              {v.vehicle_brand
                                ? ` — ${v.vehicle_brand}${v.vehicle_model ? ` ${v.vehicle_model}` : ""}`
                                : ""}
                              {v.owner_name
                                ? ` · เจ้าของ: ${v.owner_name}`
                                : ""}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                );
              })()}
              {Array.isArray(detail.documents) &&
                detail.documents.length > 1 && (
                  <div className="mb-4 rounded-lg border border-slate-200 bg-slate-50/80 p-3">
                    <button
                      type="button"
                      className="text-sm font-semibold text-indigo-700 flex items-center gap-2 w-full text-left"
                      onClick={() =>
                        setShowSubmissionHistory(!showSubmissionHistory)
                      }
                    >
                      <FileText size={16} />
                      ประวัติการส่งทั้งหมด ({detail.documents.length} รุ่น){" "}
                      {showSubmissionHistory ? "▼" : "▶"}
                    </button>
                    {showSubmissionHistory && (
                      <ul className="mt-3 space-y-2 text-xs text-slate-700 max-h-40 overflow-y-auto">
                        {(detail.documents as any[]).map(
                          (doc: any, idx: number) => (
                            <li
                              key={String(doc.id ?? idx)}
                              className="flex flex-wrap justify-between gap-2 border-b border-slate-200/80 pb-1.5"
                            >
                              <span className="font-medium">
                                {idx === 0 ? "ล่าสุด" : `ย้อนหลัง #${idx}`}
                              </span>
                              <span className="text-slate-600">
                                {String(doc.status || "")}
                                {doc.submitted_at
                                  ? ` · ${new Date(doc.submitted_at as string).toLocaleString("th-TH")}`
                                  : ""}
                              </span>
                            </li>
                          ),
                        )}
                      </ul>
                    )}
                  </div>
                )}
              {detail.documents?.length > 0 && (
                <div className="mb-6">
                  <h4 className="text-sm font-bold text-slate-700 mb-1 flex items-center gap-2">
                    <Eye size={16} /> เอกสารที่อัปโหลดแล้ว — รุ่นล่าสุด
                  </h4>
                  <p className="text-xs text-slate-500 mb-3">
                    คลิก thumbnail เพื่อดูขนาดเต็ม
                  </p>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    {([(detail.documents as any[])[0]] as any[])
                      .filter(Boolean)
                      .flatMap((d: any) => {
                        const items: Array<{
                          url: string;
                          label: string;
                          type: "image" | "video";
                        }> = [];
                        const keys = [
                          "id_card_front_url",
                          "id_card_back_url",
                          "selfie_photo_url",
                          "driving_license_front_url",
                          "driving_license_back_url",
                          "selfie_video_url",
                          "yellow_plate_photo_url",
                          "public_transport_license_front_url",
                          "public_transport_license_back_url",
                        ];
                        keys.forEach((key) => {
                          const url = d[key];
                          if (url && typeof url === "string") {
                            items.push({
                              url,
                              label: DOC_LABELS[key] || key,
                              type: key.includes("video") ? "video" : "image",
                            });
                          }
                        });
                        items.push(...vehicleRegistrationThumbnails(d));
                        return items;
                      })
                      .flat()
                      .map((item, i) => (
                        <div
                          key={`${item.url}-${i}`}
                          className="group relative rounded-lg border-2 border-slate-200 overflow-hidden bg-slate-50 cursor-pointer hover:border-indigo-400 hover:shadow-lg transition-all"
                          onClick={() => setLightbox(item)}
                        >
                          <div className="aspect-[3/4] flex items-center justify-center">
                            {item.type === "video" ? (
                              <div className="w-full h-full flex flex-col items-center justify-center p-2 bg-slate-100">
                                <FileText
                                  size={32}
                                  className="text-indigo-500 mb-1"
                                />
                                <span className="text-xs text-slate-600 truncate w-full text-center">
                                  วิดีโอ
                                </span>
                                <a
                                  href={item.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  onClick={(e) => e.stopPropagation()}
                                  className="text-xs text-indigo-600 mt-1 hover:underline"
                                >
                                  เปิดในแท็บใหม่
                                </a>
                              </div>
                            ) : (
                              <img
                                src={item.url}
                                alt={item.label}
                                className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                                onError={(e) => {
                                  (e.target as HTMLImageElement).src =
                                    "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='100' height='100' viewBox='0 0 100 100'%3E%3Crect fill='%23e2e8f0' width='100' height='100'/%3E%3Ctext x='50' y='50' fill='%2394a3b8' text-anchor='middle' dy='.3em' font-size='12'%3Eโหลดไม่สำเร็จ%3C/text%3E%3C/svg%3E";
                                }}
                              />
                            )}
                          </div>
                          <div className="absolute inset-0 flex items-center justify-center bg-black/0 group-hover:bg-black/30 transition-colors pointer-events-none">
                            <Expand
                              size={24}
                              className="text-white opacity-0 group-hover:opacity-100 transition-opacity"
                            />
                          </div>
                          <div className="p-2 bg-white/80 text-xs font-medium text-slate-700 truncate">
                            {item.label}
                          </div>
                        </div>
                      ))}
                  </div>
                  {(() => {
                    const latest = detail.documents?.[0] as
                      | Record<string, unknown>
                      | undefined;
                    const inv = buildDocumentInventory(latest);
                    const missingRequired = inv.slots.filter(
                      (s) => !s.uploaded && !s.optional,
                    );
                    const hasAnyThumb =
                      latest &&
                      (vehicleRegistrationThumbnails(latest).length > 0 ||
                        [
                          "driving_license_front_url",
                          "yellow_plate_photo_url",
                          "public_transport_license_front_url",
                        ].some((k) => latest[k]));
                    if (missingRequired.length === 0 && hasAnyThumb)
                      return null;
                    return (
                      <p className="mt-3 text-sm text-amber-800 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
                        {missingRequired.length > 0
                          ? `เอกสารบังคับที่ยังไม่ครบ: ${missingRequired.map((s) => s.label).join(", ")}`
                          : "ผู้ใช้ยังไม่แนบใบขับขี่ / รูปรถ / เอกสารรถสาธารณะ — ใช้「สั่งกรอกใหม่」หากต้องการให้ส่งเพิ่ม"}
                      </p>
                    );
                  })()}
                </div>
              )}
              <div className="space-y-3 mb-4">
                <div className="flex flex-col sm:flex-row sm:flex-wrap gap-2 sm:items-end">
                  <div className="flex-1 min-w-[140px]">
                    <label className="text-xs font-medium text-slate-500 block">
                      เทมเพลต — สั่งกรอกใหม่
                    </label>
                    <select
                      className="mt-1 w-full px-2 py-2 border border-slate-200 rounded-lg text-xs"
                      defaultValue=""
                      onChange={(e) => {
                        const t = KYC_MESSAGE_TEMPLATES_RESUBMIT.find(
                          (x) => x.id === e.target.value,
                        );
                        if (t) setRejectReason(t.text);
                        e.target.value = "";
                      }}
                    >
                      <option value="">— เลือกแล้วเติมในช่องเหตุผล —</option>
                      {KYC_MESSAGE_TEMPLATES_RESUBMIT.map((x) => (
                        <option key={x.id} value={x.id}>
                          {x.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="flex-1 min-w-[140px]">
                    <label className="text-xs font-medium text-slate-500 block">
                      เทมเพลต — ปฏิเสธถาวร
                    </label>
                    <select
                      className="mt-1 w-full px-2 py-2 border border-slate-200 rounded-lg text-xs"
                      defaultValue=""
                      onChange={(e) => {
                        const t = KYC_MESSAGE_TEMPLATES_REJECT.find(
                          (x) => x.id === e.target.value,
                        );
                        if (t) setRejectReason(t.text);
                        e.target.value = "";
                      }}
                    >
                      <option value="">— เลือกแล้วเติมในช่องเหตุผล —</option>
                      {KYC_MESSAGE_TEMPLATES_REJECT.map((x) => (
                        <option key={x.id} value={x.id}>
                          {x.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-500">
                    เหตุผล / คำแนะนำถึงผู้ใช้
                  </label>
                  <input
                    type="text"
                    placeholder="เช่น ต้องแนบบัตรด้านหลัง / รูปเซลฟี่ใหม่"
                    value={rejectReason}
                    onChange={(e) => setRejectReason(e.target.value)}
                    className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
                  />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-medium text-slate-500">
                      กำหนดส่ง (ไม่บังคับ — ใช้วันสิ้นวัน)
                    </label>
                    <input
                      type="date"
                      value={resubmitDeadline}
                      onChange={(e) => setResubmitDeadline(e.target.value)}
                      className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-slate-500">
                      รายการที่ต้องทำ (คั่นด้วยบรรทัดหรือจุลภาค)
                    </label>
                    <input
                      type="text"
                      placeholder="เช่น บัตรหลัง, selfie ใหม่"
                      value={requiredStepsText}
                      onChange={(e) => setRequiredStepsText(e.target.value)}
                      className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
                    />
                  </div>
                </div>
              </div>
              <div className="flex flex-wrap gap-3 pt-2 border-t border-slate-100">
                <button
                  onClick={handleApprove}
                  disabled={processing}
                  className="px-4 py-2 bg-emerald-600 text-white rounded-lg font-medium hover:bg-emerald-700 flex items-center gap-2 disabled:opacity-50"
                >
                  {processing ? (
                    <Loader2 size={18} className="animate-spin" />
                  ) : (
                    <CheckCircle size={18} />
                  )}
                  Approve
                </button>
                <button
                  onClick={handleRequestResubmit}
                  disabled={processing}
                  className="px-4 py-2 bg-amber-600 text-white rounded-lg font-medium hover:bg-amber-700 flex items-center gap-2 disabled:opacity-50"
                  title="ตั้งสถานะ resubmission_required — ให้ผู้ใช้ส่งชุดเอกสารใหม่ (ประวัติ submission คงอยู่)"
                >
                  <RefreshCw size={18} /> สั่งกรอกใหม่
                </button>
                <button
                  onClick={handleRequestPublicTransportSupplement}
                  disabled={processing}
                  className="px-4 py-2 bg-yellow-600 text-white rounded-lg font-medium hover:bg-yellow-700 flex items-center gap-2 disabled:opacity-50"
                  title="ขอเฉพาะป้ายเหลือง + ใบขับขี่สาธารณะ — user ไม่ต้องกรอกข้อมูลส่วนตัว/บัตรใหม่"
                >
                  <RefreshCw size={18} /> ขอเอกสารป้ายเหลือง/ใบขับขี่สาธารณะ
                </button>
                <button
                  onClick={handleReject}
                  disabled={processing}
                  className="px-4 py-2 bg-rose-600 text-white rounded-lg font-medium hover:bg-rose-700 flex items-center gap-2 disabled:opacity-50"
                  title="Permanent reject (kyc_status=rejected)"
                >
                  <XCircle size={18} /> Reject ถาวร
                </button>
                <button
                  type="button"
                  onClick={() => closeKycDetail(setDetail, setDetailUserId)}
                  className="px-4 py-2 border border-slate-300 text-slate-700 rounded-lg font-medium hover:bg-slate-50 ml-auto"
                >
                  ปิด
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Lightbox — popup ดูเอกสารขนาดเต็ม */}
      {lightbox && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/90 p-4"
          onClick={() => setLightbox(null)}
        >
          <button
            onClick={() => setLightbox(null)}
            className="absolute top-4 right-4 text-white/80 hover:text-white p-2 z-10"
          >
            <X size={32} />
          </button>
          <div
            className="relative max-w-[95vw] max-h-[95vh] flex flex-col items-center justify-center"
            onClick={(e) => e.stopPropagation()}
          >
            {lightbox.type === "video" ? (
              <div className="bg-slate-900 rounded-xl p-4 max-w-2xl w-full">
                <p className="text-white font-medium mb-2">{lightbox.label}</p>
                <video
                  src={lightbox.url}
                  controls
                  autoPlay
                  className="w-full rounded-lg"
                />
                <a
                  href={lightbox.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-indigo-400 text-sm mt-2 inline-block hover:underline"
                >
                  เปิดในแท็บใหม่ →
                </a>
              </div>
            ) : (
              <img
                src={lightbox.url}
                alt={lightbox.label}
                className="max-w-full max-h-[85vh] object-contain rounded-lg shadow-2xl"
              />
            )}
            <p className="mt-3 text-center text-white/90 text-sm">
              {lightbox.label}
            </p>
          </div>
        </div>
      )}
    </div>
  );
};
