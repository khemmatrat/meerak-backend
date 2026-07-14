import React, { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../services/api";
import { useAuth } from "../context/AuthContext";
import { useNotification } from "../context/NotificationContext";
import { useMobileAppConfig } from "../context/MobileAppConfigContext";
import {
  calcBookingEmployerTotal,
  calcBookingTalentBreakdown,
} from "../constants/bookingFeeStructure";
import { useSlotBookingFees } from "../hooks/useSlotBookingFees";
import {
  Calendar,
  Clock,
  User,
  ArrowLeft,
  RefreshCw,
  Wallet,
  CheckCircle,
  XCircle,
  Loader2,
  ThumbsUp,
  Receipt,
  MessageCircle,
  Shield,
  QrCode,
  Camera,
  AlertTriangle,
  Scale,
} from "lucide-react";
import EarningsReceipt, {
  type ReceiptData,
} from "../components/EarningsReceipt";
import { EmployerProfileSummary } from "../components/EmployerProfileSummary";
import { ChallengeResponseModal } from "../components/ChallengeResponseModal";
import { CheckInQRModal } from "../components/CheckInQRModal";
import { CheckInScanModal } from "../components/CheckInScanModal";
import { BeautyWorkPhotosPanel } from "../components/BeautyWorkPhotosPanel";

export interface MyBookingItem {
  id: string;
  slot_id: string;
  booker_id: string;
  talent_id: string;
  status: string;
  job_id: string | null;
  start_time: string;
  end_time: string;
  created_at: string;
  updated_at: string;
  deposit_amount: number;
  deposit_status: string;
  talent_name?: string | null;
  talent_phone?: string | null;
  talent_email?: string | null;
  talent_avatar?: string | null;
  booker_name?: string | null;
  booker_phone?: string | null;
  booker_email?: string | null;
  booker_avatar?: string | null;
  pending_challenges?: number;
  started_at?: string | null;
  session_status?: string;
  booking_type?: string;
  location_mode?: string | null;
  quoted_price?: number | null;
  employer_total?: number | null;
  remaining_balance?: number | null;
  amount_paid?: number;
}

const statusLabel: Record<string, string> = {
  pending: "รอยืนยัน",
  confirmed: "ยืนยันแล้ว (รอมัดจำ)",
  cancelled: "ยกเลิก",
  completed: "เสร็จแล้ว",
};

const statusColor: Record<string, string> = {
  pending: "bg-amber-100 text-amber-800 border-amber-200",
  confirmed: "bg-emerald-100 text-emerald-800 border-emerald-200",
  in_progress: "bg-blue-100 text-blue-800 border-blue-200",
  cancelled: "bg-gray-100 text-gray-600 border-gray-200",
  completed: "bg-blue-100 text-blue-800 border-blue-200",
};

type BookingTab = "my-requests" | "incoming";

export const MyBookings: React.FC = () => {
  const { user } = useAuth();
  const { notify } = useNotification();
  const { config } = useMobileAppConfig();
  const slotFees = useSlotBookingFees();
  const chatEnabled = config.featureFlags.enableChat;
  const paymentsEnabled = config.featureFlags.enablePayments;
  const [activeTab, setActiveTab] = useState<BookingTab>("my-requests");
  const [myRequests, setMyRequests] = useState<MyBookingItem[]>([]);
  const [incoming, setIncoming] = useState<MyBookingItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [payingId, setPayingId] = useState<string | null>(null);
  const [releasingId, setReleasingId] = useState<string | null>(null);
  const [actingId, setActingId] = useState<string | null>(null);
  const [receiptData, setReceiptData] = useState<ReceiptData | null>(null);
  const [employerSummaryId, setEmployerSummaryId] = useState<string | null>(
    null,
  );
  const [checkInQRBookingId, setCheckInQRBookingId] = useState<string | null>(
    null,
  );
  const [checkInScanBookingId, setCheckInScanBookingId] = useState<
    string | null
  >(null);
  const [challengeBookingId, setChallengeBookingId] = useState<string | null>(
    null,
  );
  const [challengeList, setChallengeList] = useState<any[]>([]);
  const [disputeBookingId, setDisputeBookingId] = useState<string | null>(null);
  const [disputeReason, setDisputeReason] = useState("");
  const [disputingId, setDisputingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [reqRes, incRes] = await Promise.all([
        api.get<{ bookings: MyBookingItem[] }>("/bookings/my-requests"),
        api.get<{ bookings: MyBookingItem[] }>("/bookings/me"),
      ]);
      setMyRequests(reqRes.data?.bookings ?? []);
      setIncoming(incRes.data?.bookings ?? []);
    } catch (e) {
      console.error(e);
      setMyRequests([]);
      setIncoming([]);
      notify("โหลดรายการจองไม่สำเร็จ", "error");
    } finally {
      setLoading(false);
    }
  }, [notify]);

  useEffect(() => {
    load();
  }, [load]);

  const bookings = activeTab === "my-requests" ? myRequests : incoming;

  const payDeposit = async (b: MyBookingItem) => {
    if (!paymentsEnabled) {
      notify("การชำระเงินถูกปิดชั่วคราวโดยผู้ดูแลระบบ", "warning");
      return;
    }
    setPayingId(b.id);
    try {
      if (b.booking_type === "beauty") {
        const isRemaining =
          (b.amount_paid || 0) > 0 && (b.remaining_balance || 0) > 0;
        await api.post(`/bookings/${b.id}/pay-beauty`, {
          is_remaining: isRemaining,
        });
      } else {
        await api.post(`/bookings/${b.id}/pay-deposit`);
      }
      notify("ชำระเงินเรียบร้อย", "success");
      await load();
    } catch (e: any) {
      const msg = e?.response?.data?.error || "ชำระเงินไม่สำเร็จ";
      notify(msg, "error");
    } finally {
      setPayingId(null);
    }
  };

  const acceptBeautyCompletion = async (id: string) => {
    setReleasingId(id);
    try {
      await api.post(`/bookings/${id}/accept-beauty-completion`);
      notify("ยอมรับงานแล้ว — ปล่อยเงินให้ช่าง", "success");
      await load();
    } catch (e: any) {
      notify(e?.response?.data?.error || "ดำเนินการไม่สำเร็จ", "error");
    } finally {
      setReleasingId(null);
    }
  };

  const submitBeautyDispute = async () => {
    if (!disputeBookingId) return;
    const reason = disputeReason.trim();
    if (reason.length < 10) {
      notify("กรุณาระบุเหตุผลอย่างน้อย 10 ตัวอักษร", "warning");
      return;
    }
    setDisputingId(disputeBookingId);
    try {
      await api.post(`/bookings/${disputeBookingId}/dispute-beauty`, {
        reason,
      });
      notify("ส่งข้อพิพาทแล้ว — รอแอดมินพิจารณา", "success");
      setDisputeBookingId(null);
      setDisputeReason("");
      await load();
    } catch (e: any) {
      notify(e?.response?.data?.error || "ส่งข้อพิพาทไม่สำเร็จ", "error");
    } finally {
      setDisputingId(null);
    }
  };

  const releaseDeposit = async (id: string) => {
    setReleasingId(id);
    try {
      const { data } = await api.post<{ receipt?: ReceiptData }>(
        `/bookings/${id}/release-deposit`,
      );
      notify("ยืนยันการรับบริการแล้ว เงินมัดจำถูกปล่อยให้ Talent", "success");
      if (data?.receipt) setReceiptData(data.receipt);
      await load();
    } catch (e: any) {
      const msg = e?.response?.data?.error || "ปล่อยมัดจำไม่สำเร็จ";
      notify(msg, "error");
    } finally {
      setReleasingId(null);
    }
  };

  const viewReceipt = async (id: string) => {
    try {
      const { data } = await api.get<ReceiptData>(
        `/earnings/receipt/booking/${id}`,
      );
      setReceiptData(data);
    } catch (e) {
      notify("โหลดใบเสร็จไม่สำเร็จ", "error");
    }
  };

  const acceptBooking = async (id: string) => {
    setActingId(id);
    try {
      await api.patch(`/bookings/${id}`, { status: "confirmed" });
      notify("ยืนยันคิวแล้ว — รอลูกค้าชำระมัดจำ", "success");
      await load();
    } catch (e: any) {
      const msg =
        e?.response?.data?.error ||
        e?.response?.data?.message ||
        "ยืนยันไม่สำเร็จ";
      notify(msg, "error");
    } finally {
      setActingId(null);
    }
  };

  const rejectBooking = async (id: string) => {
    setActingId(id);
    try {
      await api.patch(`/bookings/${id}`, { status: "cancelled" });
      notify("ยกเลิกคำขอจองแล้ว", "success");
      await load();
    } catch (e: any) {
      const msg = e?.response?.data?.error || "ยกเลิกไม่สำเร็จ";
      notify(msg, "error");
    } finally {
      setActingId(null);
    }
  };

  const pendingList = bookings.filter((b) => b.status === "pending");
  const confirmedList = bookings.filter((b) => b.status === "confirmed");
  const otherList = bookings.filter(
    (b) => !["pending", "confirmed"].includes(b.status),
  );

  const formatSlot = (start: string, end: string) => {
    const d = new Date(start);
    const e = new Date(end);
    return {
      date: d.toLocaleDateString("th-TH", {
        weekday: "short",
        day: "numeric",
        month: "short",
        year: "2-digit",
      }),
      time: `${d.toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" })} – ${e.toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" })}`,
    };
  };

  const renderCard = (b: MyBookingItem) => {
    const slot = formatSlot(b.start_time, b.end_time);
    const isIncoming = activeTab === "incoming";
    const displayName = isIncoming
      ? b.booker_name || "ลูกค้า"
      : b.talent_name || "Talent";
    const isBeauty = b.booking_type === "beauty";
    const showPayDeposit = isBeauty
      ? !isIncoming &&
        b.status === "confirmed" &&
        ((b.deposit_status || "none") !== "held" ||
          (b.remaining_balance || 0) > 0.01)
      : !isIncoming &&
        b.status === "confirmed" &&
        b.deposit_amount > 0 &&
        b.deposit_status !== "held";
    const showAcceptBeauty =
      !isIncoming && isBeauty && b.session_status === "awaiting_acceptance";
    const showDisputeBeauty =
      !isIncoming && isBeauty && b.session_status === "awaiting_acceptance";
    const showBeautyDisputed = isBeauty && b.session_status === "disputed";
    const showReleaseDeposit =
      !isBeauty &&
      !isIncoming &&
      (b.status === "confirmed" || b.status === "in_progress") &&
      b.deposit_amount > 0 &&
      b.deposit_status === "held";
    const showAcceptReject = isIncoming && b.status === "pending";
    const showChat =
      (b.status === "confirmed" || b.status === "in_progress") &&
      b.deposit_status === "held";
    const startTime = new Date(b.start_time);
    const checkinOpens = new Date(startTime);
    checkinOpens.setMinutes(checkinOpens.getMinutes() - 15);
    const now = new Date();
    const isWithinCheckin = now >= checkinOpens && now <= new Date(b.end_time);
    const isPastStart = now >= startTime;
    const showCheckInQR =
      !isBeauty &&
      isIncoming &&
      b.status === "confirmed" &&
      b.deposit_status === "held" &&
      !b.started_at &&
      isWithinCheckin;
    const showCheckInScan =
      !isBeauty &&
      !isIncoming &&
      b.status === "confirmed" &&
      b.deposit_status === "held" &&
      !b.started_at &&
      isWithinCheckin;
    const showBeautyBeforePhotos =
      isIncoming &&
      isBeauty &&
      b.deposit_status === "held" &&
      (b.session_status === "awaiting_checkin" ||
        (!b.started_at && b.status === "confirmed"));
    const showBeautyAfterPhotos =
      isIncoming &&
      isBeauty &&
      (b.session_status === "in_progress" || b.status === "in_progress");
    const showBeautyPhotosReadOnly =
      isBeauty &&
      !isIncoming &&
      (b.session_status === "awaiting_acceptance" ||
        b.session_status === "disputed" ||
        b.status === "completed");
    const showBeautyAwaitingCustomer =
      isIncoming && isBeauty && b.session_status === "awaiting_acceptance";
    const showProtectedBanner =
      b.status === "in_progress" ||
      (b.started_at && b.deposit_status === "held");
    const showUnprotectedWarning =
      b.status === "confirmed" &&
      b.deposit_status === "held" &&
      !b.started_at &&
      isPastStart;
    const avatarUrl = isIncoming
      ? (b.booker_avatar ?? undefined)
      : b.talent_avatar;
    const showPriorityBadge =
      !isIncoming && b.status === "confirmed" && b.deposit_status === "held";
    const hasChallenges = !isIncoming && (b.pending_challenges || 0) > 0;

    const openChallengeModal = async () => {
      if (!b.id) return;
      try {
        const { data } = await api.get<{ challenges: any[] }>(
          `/bookings/${b.id}/challenges`,
        );
        setChallengeList(data?.challenges ?? []);
        setChallengeBookingId(b.id);
      } catch {
        setChallengeList([]);
      }
    };

    return (
      <div
        key={b.id}
        className="flex flex-col gap-3 p-5 rounded-xl bg-white/10 border border-white/20 hover:bg-white/15 transition-colors"
      >
        {showProtectedBanner && (
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-emerald-100 border border-emerald-200 text-emerald-800 text-sm">
            <Shield size={18} />
            <span>Protected by AQOND Insurance & Support</span>
          </div>
        )}
        {showUnprotectedWarning && (
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-amber-100 border border-amber-200 text-amber-800 text-sm">
            <AlertTriangle size={18} />
            <span>
              Unprotected Session — กรุณา Check-in ในแอปเพื่อรับความคุ้มครอง
            </span>
          </div>
        )}
        {showBeautyDisputed && (
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-rose-100 border border-rose-200 text-rose-900 text-sm">
            <Scale size={18} />
            <span>
              {isIncoming
                ? "ลูกค้าเปิดข้อพิพาท — รอแอดมินพิจารณา เงินยังไม่ถูกปล่อย"
                : "ข้อพิพาทอยู่ระหว่างตรวจสอบ — เงินถูกพักไว้จนกว่าแอดมินจะตัดสิน"}
            </span>
          </div>
        )}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-start gap-4 flex-1 min-w-0">
            <div
              className={`w-14 h-14 rounded-xl bg-amber-500/20 flex items-center justify-center shrink-0 overflow-hidden border border-white/10 ${isIncoming ? "cursor-pointer hover:ring-2 hover:ring-amber-400 transition-all" : ""}`}
              onClick={
                isIncoming ? () => setEmployerSummaryId(b.booker_id) : undefined
              }
              role={isIncoming ? "button" : undefined}
              aria-label={isIncoming ? "ดูโปรไฟล์นายจ้าง" : undefined}
            >
              {avatarUrl ? (
                <img
                  src={avatarUrl}
                  alt=""
                  className="w-full h-full object-cover"
                />
              ) : (
                <User size={28} className="text-amber-600" />
              )}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="font-semibold text-gray-900 truncate">
                  {displayName}
                </p>
                {showPriorityBadge && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-800 border border-amber-200">
                    <Shield size={12} />
                    สิทธิ์แรก
                  </span>
                )}
                {hasChallenges && (
                  <button
                    onClick={openChallengeModal}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-amber-500 text-white hover:bg-amber-600"
                  >
                    มีผู้ท้าชิง
                  </button>
                )}
              </div>
              <p className="text-sm text-gray-600 mt-0.5 flex items-center gap-1">
                <Calendar size={14} />
                {slot.date}
              </p>
              <p className="text-sm text-gray-500 flex items-center gap-1">
                <Clock size={14} />
                {slot.time}
              </p>
              {isBeauty && b.employer_total != null && (
                <p className="text-sm text-sky-700 mt-1">
                  ความงาม ·{" "}
                  {b.location_mode === "at_home" ? "นอกสถานที่" : "ที่ร้าน"} ·
                  รวม ฿{b.employer_total.toLocaleString()}
                </p>
              )}
              {(b.deposit_amount > 0 ||
                (isBeauty && (b.employer_total || 0) > 0)) && (
                <div className="text-sm text-gray-600 mt-1">
                  <p className="flex items-center gap-1">
                    <Wallet size={14} />
                    มัดจำ ฿{b.deposit_amount.toLocaleString()}
                    {showPayDeposit &&
                      (() => {
                        const { totalToPay, markupAmount } =
                          calcBookingEmployerTotal(
                            b.deposit_amount,
                            user?.vip_tier,
                            slotFees ?? undefined,
                          );
                        return (
                          <span className="text-amber-600 font-medium">
                            {" "}
                            → จ่ายจริง ฿{totalToPay.toLocaleString()}
                            {markupAmount > 0 && (
                              <span className="text-amber-500/80 text-xs">
                                {" "}
                                (+ markup ฿{markupAmount.toLocaleString()})
                              </span>
                            )}
                          </span>
                        );
                      })()}
                    {b.deposit_status === "held" && (
                      <span className="text-emerald-600 font-medium">
                        {" "}
                        (ล็อคแล้ว)
                      </span>
                    )}
                    {b.deposit_status === "released" && (
                      <span className="text-blue-600 font-medium">
                        {" "}
                        (ปล่อยแล้ว)
                      </span>
                    )}
                  </p>
                  <details className="mt-1.5">
                    <summary className="text-xs text-amber-600 cursor-pointer hover:underline">
                      Breakdown
                    </summary>
                    <div className="mt-2 p-3 rounded-lg bg-amber-50/80 border border-amber-200 text-xs space-y-1">
                      {!isIncoming ? (
                        <>
                          <div className="flex justify-between">
                            <span>ค่ามัดจำ</span>
                            <span className="font-mono">
                              ฿{b.deposit_amount.toLocaleString()}
                            </span>
                          </div>
                          {(() => {
                            const { markupAmount, markupRate, totalToPay } =
                              calcBookingEmployerTotal(
                                b.deposit_amount,
                                user?.vip_tier,
                                slotFees ?? undefined,
                              );
                            return (
                              <>
                                <div className="flex justify-between">
                                  <span>
                                    Markup ({(markupRate * 100).toFixed(0)}%)
                                  </span>
                                  <span className="font-mono">
                                    +฿{markupAmount.toLocaleString()}
                                  </span>
                                </div>
                                <hr className="border-amber-200 my-1" />
                                <div className="flex justify-between font-semibold text-amber-900">
                                  <span>ยอดที่จ่าย</span>
                                  <span className="font-mono">
                                    ฿{totalToPay.toLocaleString()}
                                  </span>
                                </div>
                              </>
                            );
                          })()}
                        </>
                      ) : (
                        (() => {
                          const tb = calcBookingTalentBreakdown(
                            b.deposit_amount,
                            b.deposit_amount,
                            user?.vip_tier,
                            slotFees ?? undefined,
                          );
                          return (
                            <>
                              <div className="flex justify-between">
                                <span>ค่ามัดจำ</span>
                                <span className="font-mono">
                                  ฿{tb.depositAmount.toLocaleString()}
                                </span>
                              </div>
                              <div className="flex justify-between text-gray-600">
                                <span>
                                  Sourcing ({(tb.sourcingRate * 100).toFixed(0)}
                                  %)
                                </span>
                                <span className="font-mono">
                                  -฿{tb.sourcingFee.toLocaleString()}
                                </span>
                              </div>
                              <div className="flex justify-between text-gray-600">
                                <span>
                                  Commission (
                                  {(tb.commissionRate * 100).toFixed(0)}%)
                                </span>
                                <span className="font-mono">
                                  -฿{tb.commission.toLocaleString()}
                                </span>
                              </div>
                              <hr className="border-amber-200 my-1" />
                              <div className="flex justify-between font-semibold text-emerald-700">
                                <span>คุณได้รับสุทธิ</span>
                                <span className="font-mono">
                                  ฿{tb.talentPayout.toLocaleString()}
                                </span>
                              </div>
                            </>
                          );
                        })()
                      )}
                    </div>
                  </details>
                </div>
              )}
            </div>
          </div>
          <div className="flex items-center gap-3 shrink-0 flex-wrap">
            <span
              className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium border ${statusColor[b.status] || "bg-gray-100 text-gray-700"}`}
            >
              {b.status === "confirmed" && (
                <CheckCircle size={14} className="mr-1" />
              )}
              {b.status === "cancelled" && (
                <XCircle size={14} className="mr-1" />
              )}
              {statusLabel[b.status] || b.status}
            </span>
            {showAcceptReject && (
              <>
                <button
                  onClick={() => acceptBooking(b.id)}
                  disabled={actingId === b.id}
                  className="px-4 py-2 rounded-xl bg-emerald-600 text-white font-semibold hover:bg-emerald-700 disabled:opacity-50 flex items-center gap-2 shrink-0"
                >
                  {actingId === b.id ? (
                    <Loader2 size={18} className="animate-spin" />
                  ) : (
                    <CheckCircle size={18} />
                  )}
                  รับคิว
                </button>
                <button
                  onClick={() => rejectBooking(b.id)}
                  disabled={actingId === b.id}
                  className="px-4 py-2 rounded-xl border border-gray-300 text-gray-700 font-medium hover:bg-gray-100 disabled:opacity-50 flex items-center gap-2 shrink-0"
                >
                  <XCircle size={18} />
                  ปฏิเสธ
                </button>
              </>
            )}
            {showPayDeposit &&
              (() => {
                const beautyPay =
                  isBeauty && (b.remaining_balance || 0) > 0
                    ? b.remaining_balance!
                    : isBeauty
                      ? b.employer_total || 0
                      : calcBookingEmployerTotal(
                          b.deposit_amount,
                          user?.vip_tier,
                          slotFees ?? undefined,
                        ).totalToPay;
                const label =
                  isBeauty && (b.amount_paid || 0) > 0
                    ? "ชำระยอดคงเหลือ"
                    : "ชำระเงิน";
                return (
                  <button
                    onClick={() => payDeposit(b)}
                    disabled={payingId === b.id || !paymentsEnabled}
                    className="px-4 py-2 rounded-xl bg-amber-500 text-white font-semibold hover:bg-amber-600 disabled:opacity-50 flex items-center gap-2 shrink-0"
                    title={`ชำระ ฿${beautyPay.toLocaleString()}`}
                  >
                    {payingId === b.id ? (
                      <Loader2 size={18} className="animate-spin" />
                    ) : (
                      <Wallet size={18} />
                    )}
                    {label} ฿{beautyPay.toLocaleString()}
                  </button>
                );
              })()}
            {showAcceptBeauty && (
              <button
                onClick={() => acceptBeautyCompletion(b.id)}
                disabled={releasingId === b.id}
                className="px-4 py-2 rounded-xl bg-emerald-600 text-white font-semibold hover:bg-emerald-700 disabled:opacity-50 flex items-center gap-2 shrink-0"
              >
                {releasingId === b.id ? (
                  <Loader2 size={18} className="animate-spin" />
                ) : (
                  <ThumbsUp size={18} />
                )}
                ยอมรับงาน
              </button>
            )}
            {showDisputeBeauty && (
              <button
                onClick={() => {
                  setDisputeBookingId(b.id);
                  setDisputeReason("");
                }}
                disabled={disputingId === b.id}
                className="px-4 py-2 rounded-xl border border-rose-300 bg-rose-50 text-rose-800 font-semibold hover:bg-rose-100 disabled:opacity-50 flex items-center gap-2 shrink-0"
              >
                <Scale size={18} />
                โต้แย้ง
              </button>
            )}
            {showReleaseDeposit && (
              <button
                onClick={() => releaseDeposit(b.id)}
                disabled={releasingId === b.id}
                className="px-4 py-2 rounded-xl bg-emerald-600 text-white font-semibold hover:bg-emerald-700 disabled:opacity-50 flex items-center gap-2 shrink-0"
              >
                {releasingId === b.id ? (
                  <Loader2 size={18} className="animate-spin" />
                ) : (
                  <ThumbsUp size={18} />
                )}
                ยืนยันการรับบริการ
              </button>
            )}
            {showCheckInQR && (
              <button
                onClick={() => setCheckInQRBookingId(b.id)}
                data-tour="talent-qr-checkin"
                className="px-4 py-2 rounded-xl bg-emerald-600 text-white font-semibold hover:bg-emerald-700 flex items-center gap-2 shrink-0"
              >
                <QrCode size={18} />
                แสดง QR
              </button>
            )}
            {showCheckInScan && (
              <button
                onClick={() => setCheckInScanBookingId(b.id)}
                className="px-4 py-2 rounded-xl bg-emerald-600 text-white font-semibold hover:bg-emerald-700 flex items-center gap-2 shrink-0"
              >
                <Camera size={18} />
                สแกน QR
              </button>
            )}
            {showChat &&
              (chatEnabled ? (
                <Link
                  to={`/bookings/${b.id}/chat`}
                  className="px-4 py-2 rounded-xl bg-emerald-500 text-white font-semibold hover:bg-emerald-600 flex items-center gap-2 shrink-0"
                >
                  <MessageCircle size={18} />
                  แชท
                </Link>
              ) : (
                <button
                  type="button"
                  onClick={() =>
                    notify("แชทถูกปิดชั่วคราวโดยผู้ดูแลระบบ", "warning")
                  }
                  className="px-4 py-2 rounded-xl bg-slate-500 text-slate-200 font-semibold cursor-not-allowed opacity-80 flex items-center gap-2 shrink-0"
                >
                  <MessageCircle size={18} />
                  แชท
                </button>
              ))}
            {b.deposit_status === "released" && (
              <button
                onClick={() => viewReceipt(b.id)}
                data-tour="talent-earnings-receipt"
                className="px-4 py-2 rounded-xl border border-gray-300 text-gray-700 font-medium hover:bg-gray-50 flex items-center gap-2 shrink-0"
              >
                <Receipt size={18} />
                ดูใบเสร็จ
              </button>
            )}
          </div>
        </div>

        {showBeautyBeforePhotos && (
          <BeautyWorkPhotosPanel
            bookingId={b.id}
            phase="before"
            minPhotos={4}
            onSubmitted={() => {
              notify("บันทึกรูปก่อนงานแล้ว — เริ่มให้บริการได้", "success");
              void load();
            }}
            onError={(msg) => notify(msg, "error")}
          />
        )}

        {showBeautyAfterPhotos && (
          <BeautyWorkPhotosPanel
            bookingId={b.id}
            phase="after"
            minPhotos={4}
            onSubmitted={() => {
              notify("ส่งงานแล้ว — รอลูกค้ายอมรับ", "success");
              void load();
            }}
            onError={(msg) => notify(msg, "error")}
          />
        )}

        {showBeautyAwaitingCustomer && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            ส่งงานแล้ว — รอลูกค้ากดยอมรับในแท็บ「ที่ฉันจอง」
          </div>
        )}

        {showBeautyPhotosReadOnly && (
          <div className="space-y-3">
            <p className="text-sm font-semibold text-gray-800">
              รูปก่อน & หลังงาน
            </p>
            <BeautyWorkPhotosPanel bookingId={b.id} phase="before" readOnly />
            <BeautyWorkPhotosPanel bookingId={b.id} phase="after" readOnly />
          </div>
        )}
      </div>
    );
  };

  return (
    <>
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-amber-50/30 to-slate-100">
        <div className="max-w-4xl mx-auto px-4 py-8">
          <Link
            to="/"
            className="inline-flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-6"
          >
            <ArrowLeft size={20} />
            กลับหน้าแรก
          </Link>

          <div className="rounded-2xl border border-white/20 bg-white/10 backdrop-blur-xl shadow-xl p-6 sm:p-8 mb-6">
            <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-3 mb-2">
              <Calendar size={28} className="text-amber-500" />
              การจองคิวของฉัน
            </h1>
            <p className="text-gray-600 mb-4">
              {activeTab === "my-requests"
                ? "รายการที่คุณกดจองไป — ชำระมัดจำเมื่อ Talent ยืนยันแล้ว"
                : "คำขอจองที่ส่งถึงคุณ — เลือกรับหรือปฏิเสธได้"}
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setActiveTab("my-requests")}
                className={`px-4 py-2 rounded-xl font-medium text-sm transition-all ${
                  activeTab === "my-requests"
                    ? "bg-amber-500 text-white shadow"
                    : "bg-white/50 text-gray-600 border border-white/30 hover:bg-white/70"
                }`}
              >
                ที่ฉันจอง ({myRequests.length})
              </button>
              <button
                onClick={() => setActiveTab("incoming")}
                className={`px-4 py-2 rounded-xl font-medium text-sm transition-all ${
                  activeTab === "incoming"
                    ? "bg-amber-500 text-white shadow"
                    : "bg-white/50 text-gray-600 border border-white/30 hover:bg-white/70"
                }`}
              >
                คำขอที่ส่งถึงฉัน ({incoming.length})
                {incoming.filter((x) => x.status === "pending").length > 0 && (
                  <span className="ml-1 inline-flex items-center justify-center w-5 h-5 text-xs rounded-full bg-amber-600 text-white">
                    {incoming.filter((x) => x.status === "pending").length}
                  </span>
                )}
              </button>
            </div>
          </div>

          {loading ? (
            <div className="flex justify-center py-16">
              <RefreshCw size={36} className="animate-spin text-amber-500" />
            </div>
          ) : bookings.length === 0 ? (
            <div className="rounded-2xl border border-white/20 bg-white/10 backdrop-blur-xl shadow-xl p-12 text-center">
              <Clock size={48} className="mx-auto text-gray-400 mb-4" />
              <p className="text-gray-600 font-medium">
                {activeTab === "incoming"
                  ? "ยังไม่มีคำขอจองส่งถึงคุณ"
                  : "ยังไม่มีรายการจอง"}
              </p>
              <p className="text-sm text-gray-500 mt-2">
                {activeTab === "incoming"
                  ? "เมื่อมีลูกค้าจองคิวกับคุณ คำขอล่าสุดจะโผล่ที่แท็บนี้ — คุณเลือกรับหรือปฏิเสธได้"
                  : "ไปเลือก Talent แล้วกดจองคิวได้ที่หน้าหา Talent"}
              </p>
              {activeTab === "my-requests" && (
                <Link
                  to="/talents"
                  className="inline-block mt-6 px-6 py-3 rounded-xl bg-amber-500 text-white font-semibold hover:bg-amber-600"
                >
                  ดู Talent
                </Link>
              )}
            </div>
          ) : (
            <div className="space-y-8">
              {pendingList.length > 0 && (
                <section>
                  <h2 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
                    <Clock size={20} className="text-amber-500" />
                    รอยืนยัน ({pendingList.length})
                  </h2>
                  <div className="rounded-2xl border border-white/20 bg-white/10 backdrop-blur-xl shadow-xl p-6 space-y-4">
                    {pendingList.map(renderCard)}
                  </div>
                </section>
              )}

              {confirmedList.length > 0 && (
                <section>
                  <h2 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
                    <CheckCircle size={20} className="text-emerald-500" />
                    ยืนยันแล้ว ({confirmedList.length})
                  </h2>
                  <div className="rounded-2xl border border-white/20 bg-white/10 backdrop-blur-xl shadow-xl p-6 space-y-4">
                    {confirmedList.map(renderCard)}
                  </div>
                </section>
              )}

              {otherList.length > 0 && (
                <section>
                  <h2 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
                    <XCircle size={20} className="text-gray-500" />
                    อื่นๆ ({otherList.length})
                  </h2>
                  <div className="rounded-2xl border border-white/20 bg-white/10 backdrop-blur-xl shadow-xl p-6 space-y-4">
                    {otherList.map(renderCard)}
                  </div>
                </section>
              )}
            </div>
          )}
        </div>
      </div>
      {receiptData && (
        <EarningsReceipt
          data={receiptData}
          onClose={() => setReceiptData(null)}
        />
      )}
      {employerSummaryId && (
        <EmployerProfileSummary
          employerId={employerSummaryId}
          onClose={() => setEmployerSummaryId(null)}
        />
      )}
      {checkInQRBookingId && (
        <CheckInQRModal
          bookingId={checkInQRBookingId}
          onClose={() => setCheckInQRBookingId(null)}
        />
      )}
      {checkInScanBookingId && (
        <CheckInScanModal
          bookingId={checkInScanBookingId}
          onClose={() => setCheckInScanBookingId(null)}
          onSuccess={() => {
            setCheckInScanBookingId(null);
            load();
          }}
        />
      )}
      {challengeBookingId && challengeList.length > 0 && (
        <ChallengeResponseModal
          bookingId={challengeBookingId}
          challenges={challengeList}
          onClose={() => {
            setChallengeBookingId(null);
            setChallengeList([]);
          }}
          onResponded={() => {
            setChallengeBookingId(null);
            setChallengeList([]);
            load();
          }}
        />
      )}
      {disputeBookingId && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl">
            <h3 className="text-lg font-bold text-gray-900 mb-1">
              เปิดข้อพิพาท
            </h3>
            <p className="text-sm text-gray-600 mb-4">
              อธิบายปัญหาที่พบ (อย่างน้อย 10 ตัวอักษร) —
              เงินจะถูกพักไว้จนกว่าแอดมินจะตัดสิน
            </p>
            <textarea
              value={disputeReason}
              onChange={(e) => setDisputeReason(e.target.value)}
              rows={4}
              className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-rose-400"
              placeholder="เช่น งานไม่ตรงตามที่ตกลง / รูปหลังงานไม่ตรงกับที่ทำจริง"
            />
            <div className="mt-4 flex gap-2 justify-end">
              <button
                type="button"
                onClick={() => {
                  setDisputeBookingId(null);
                  setDisputeReason("");
                }}
                className="px-4 py-2 rounded-xl border border-gray-300 text-gray-700 font-medium hover:bg-gray-50"
              >
                ยกเลิก
              </button>
              <button
                type="button"
                onClick={() => void submitBeautyDispute()}
                disabled={disputingId === disputeBookingId}
                className="px-4 py-2 rounded-xl bg-rose-600 text-white font-semibold hover:bg-rose-700 disabled:opacity-50 flex items-center gap-2"
              >
                {disputingId === disputeBookingId ? (
                  <Loader2 size={18} className="animate-spin" />
                ) : (
                  <Scale size={18} />
                )}
                ส่งข้อพิพาท
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
