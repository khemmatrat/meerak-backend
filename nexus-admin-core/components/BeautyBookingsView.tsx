import React, { useCallback, useEffect, useState } from "react";
import {
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Loader2,
  RefreshCw,
  Scissors,
  Settings,
  Scale,
  X,
} from "lucide-react";
import {
  getAdminBeautyBooking,
  getAdminBeautyBookings,
  getAdminBeautyDisputes,
  resolveAdminBeautyDispute,
  type AdminBeautyBookingRow,
  type AdminBeautyDisputeRow,
} from "../services/adminApi";
import { MerchantHubBookingFeesPanel } from "./MerchantHubBookingFeesPanel";

const STATUS_LABELS: Record<string, string> = {
  pending: "รอยืนยัน",
  confirmed: "ยืนยันแล้ว",
  in_progress: "กำลังให้บริการ",
  completed: "เสร็จสิ้น",
  cancelled: "ยกเลิก",
};

const SESSION_LABELS: Record<string, string> = {
  awaiting_checkin: "รอเริ่มงาน",
  in_progress: "กำลังทำ",
  awaiting_acceptance: "รอลูกค้ายอมรับ",
  completed: "ปิดงาน",
  no_show: "ไม่มา",
  disputed: "โต้แย้ง",
};

function fmtThb(n: number | null | undefined) {
  return `฿${Number(n || 0).toLocaleString("th-TH", { minimumFractionDigits: 0 })}`;
}

function fmtDt(iso?: string | null) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("th-TH");
  } catch {
    return iso;
  }
}

type BeautyBookingsViewProps = {
  onOpenUser?: (userId: string) => void;
};

export const BeautyBookingsView: React.FC<BeautyBookingsViewProps> = ({
  onOpenUser,
}) => {
  const [tab, setTab] = useState<string>("all");
  const [rows, setRows] = useState<AdminBeautyBookingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<Awaited<
    ReturnType<typeof getAdminBeautyBooking>
  > | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [showPolicy, setShowPolicy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [disputes, setDisputes] = useState<AdminBeautyDisputeRow[]>([]);
  const [disputeFilter, setDisputeFilter] = useState<
    "open" | "resolved" | "rejected"
  >("open");
  const [resolvingId, setResolvingId] = useState<string | null>(null);
  const [resolveTarget, setResolveTarget] =
    useState<AdminBeautyDisputeRow | null>(null);
  const [resolveNote, setResolveNote] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      if (tab === "disputes") {
        const { disputes: list } = await getAdminBeautyDisputes({
          status: disputeFilter,
        });
        setDisputes(list);
        setRows([]);
        return;
      }
      const params: {
        status?: string;
        session_status?: string;
        limit?: number;
      } = { limit: 100 };
      if (tab === "pending") params.status = "pending";
      else if (tab === "confirmed") params.status = "confirmed";
      else if (tab === "in_progress") params.status = "in_progress";
      else if (tab === "completed") params.status = "completed";
      else if (tab === "awaiting_acceptance")
        params.session_status = "awaiting_acceptance";
      else if (tab === "disputed") params.session_status = "disputed";
      const { bookings } = await getAdminBeautyBookings(params);
      setRows(bookings);
      setDisputes([]);
    } catch (e: unknown) {
      setError((e as { message?: string })?.message || "โหลดรายการไม่สำเร็จ");
      setRows([]);
      setDisputes([]);
    } finally {
      setLoading(false);
    }
  }, [tab, disputeFilter]);

  useEffect(() => {
    void load();
  }, [load]);

  const openDetail = async (id: string) => {
    setSelectedId(id);
    setDetailLoading(true);
    setDetail(null);
    try {
      const d = await getAdminBeautyBooking(id);
      setDetail(d);
    } catch {
      setNotice("โหลดรายละเอียดไม่สำเร็จ");
    } finally {
      setDetailLoading(false);
    }
  };

  const tabs = [
    { id: "all", label: "ทั้งหมด" },
    { id: "pending", label: "รอยืนยัน" },
    { id: "confirmed", label: "ยืนยันแล้ว" },
    { id: "in_progress", label: "กำลังทำ" },
    { id: "awaiting_acceptance", label: "รอยอมรับ" },
    { id: "disputed", label: "โต้แย้ง" },
    { id: "completed", label: "เสร็จแล้ว" },
    { id: "disputes", label: "ข้อพิพาท" },
  ];

  const RESOLUTION_LABELS: Record<string, string> = {
    refund_customer: "คืนเงินลูกค้า",
    release_provider: "ปล่อยให้ช่าง",
    reject_dispute: "ปฏิเสธข้อพิพาท",
  };

  const submitResolve = async (
    resolution: "refund_customer" | "release_provider" | "reject_dispute",
  ) => {
    if (!resolveTarget) return;
    setResolvingId(resolveTarget.id);
    setNotice(null);
    try {
      const r = await resolveAdminBeautyDispute(resolveTarget.id, {
        resolution,
        resolution_note: resolveNote.trim() || undefined,
      });
      setNotice(r.message || "ตัดสินข้อพิพาทแล้ว");
      setResolveTarget(null);
      setResolveNote("");
      await load();
    } catch {
      setNotice("ตัดสินข้อพิพาทไม่สำเร็จ");
    } finally {
      setResolvingId(null);
    }
  };

  const b = detail?.booking as Record<string, unknown> | undefined;
  const payout = detail?.provider_payout;

  return (
    <div className="flex h-full flex-col overflow-hidden bg-slate-50">
      <div className="border-b border-slate-200 bg-white px-4 py-4 sm:px-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Scissors className="h-6 w-6 text-sky-600" />
            <div>
              <h1 className="text-lg font-bold text-slate-900">
                Beauty Bookings
              </h1>
              <p className="text-xs text-slate-500">
                จองช่างตัดผม / ความงาม — ดูรายการ รูปก่อน-หลัง
                และนโยบายค่าธรรมเนียม
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setShowPolicy((v) => !v)}
              className="flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              <Settings className="h-4 w-4" />
              นโยบาย
              {showPolicy ? (
                <ChevronUp className="h-4 w-4" />
              ) : (
                <ChevronDown className="h-4 w-4" />
              )}
            </button>
            <button
              type="button"
              onClick={() => void load()}
              className="flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
            >
              <RefreshCw className="h-4 w-4" />
              รีเฟรช
            </button>
          </div>
        </div>
        {notice ? (
          <p className="mt-2 text-sm text-emerald-700">{notice}</p>
        ) : null}
      </div>

      {showPolicy && (
        <div className="border-b border-sky-100 bg-sky-50/80 px-4 py-4 sm:px-6 max-h-[70vh] overflow-y-auto">
          <MerchantHubBookingFeesPanel
            embedded
            onNotice={(msg) => setNotice(msg)}
          />
        </div>
      )}

      <div className="flex flex-1 overflow-hidden">
        <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
          <div className="flex flex-wrap gap-1 border-b border-slate-200 bg-white px-4 py-2">
            {tabs.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                className={`rounded-lg px-3 py-1.5 text-xs font-medium ${
                  tab === t.id
                    ? t.id === "disputes"
                      ? "bg-rose-600 text-white"
                      : "bg-sky-600 text-white"
                    : "text-slate-600 hover:bg-slate-100"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          {tab === "disputes" ? (
            <div className="flex gap-2 border-b border-slate-100 bg-slate-50 px-4 py-2">
              {(["open", "resolved", "rejected"] as const).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setDisputeFilter(s)}
                  className={`rounded px-2 py-1 text-xs font-medium ${
                    disputeFilter === s
                      ? "bg-rose-100 text-rose-800"
                      : "text-slate-600 hover:bg-white"
                  }`}
                >
                  {s === "open"
                    ? "เปิดอยู่"
                    : s === "resolved"
                      ? "ตัดสินแล้ว"
                      : "ปฏิเสธ"}
                </button>
              ))}
            </div>
          ) : null}

          <div className="flex-1 overflow-auto p-4">
            {loading ? (
              <div className="flex justify-center py-16">
                <Loader2 className="h-8 w-8 animate-spin text-sky-600" />
              </div>
            ) : error ? (
              <p className="text-center text-red-600">{error}</p>
            ) : tab === "disputes" ? (
              disputes.length === 0 ? (
                <p className="text-center text-slate-500 py-12">
                  ไม่มีข้อพิพาท
                </p>
              ) : (
                <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
                  <table className="min-w-full text-sm">
                    <thead className="bg-slate-50 text-left text-xs text-slate-600">
                      <tr>
                        <th className="px-3 py-2">วันที่</th>
                        <th className="px-3 py-2">ลูกค้า</th>
                        <th className="px-3 py-2">ช่าง</th>
                        <th className="px-3 py-2">เหตุผล</th>
                        <th className="px-3 py-2">ชำระแล้ว</th>
                        <th className="px-3 py-2">สถานะ</th>
                        <th className="px-3 py-2" />
                      </tr>
                    </thead>
                    <tbody>
                      {disputes.map((d) => (
                        <tr
                          key={d.id}
                          className="border-t border-slate-100 hover:bg-rose-50/30"
                        >
                          <td className="px-3 py-2 text-xs whitespace-nowrap">
                            {fmtDt(d.created_at)}
                          </td>
                          <td className="px-3 py-2">{d.booker_name || "—"}</td>
                          <td className="px-3 py-2">{d.talent_name || "—"}</td>
                          <td className="px-3 py-2 max-w-[200px] text-xs text-slate-700">
                            {d.reason}
                          </td>
                          <td className="px-3 py-2 font-mono text-xs">
                            {fmtThb(d.amount_paid)}
                          </td>
                          <td className="px-3 py-2 text-xs">
                            {d.status}
                            {d.resolution ? (
                              <div className="text-[10px] text-slate-500">
                                {RESOLUTION_LABELS[d.resolution] ||
                                  d.resolution}
                              </div>
                            ) : null}
                          </td>
                          <td className="px-3 py-2 whitespace-nowrap">
                            <button
                              type="button"
                              className="text-sky-600 text-xs font-semibold hover:underline mr-2"
                              onClick={() => void openDetail(d.booking_id)}
                            >
                              จอง
                            </button>
                            {d.status === "open" ? (
                              <button
                                type="button"
                                className="text-rose-600 text-xs font-semibold hover:underline inline-flex items-center gap-0.5"
                                onClick={() => {
                                  setResolveTarget(d);
                                  setResolveNote("");
                                }}
                              >
                                <Scale className="h-3 w-3" />
                                ตัดสิน
                              </button>
                            ) : null}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )
            ) : rows.length === 0 ? (
              <p className="text-center text-slate-500 py-12">ไม่มีรายการ</p>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
                <table className="min-w-full text-sm">
                  <thead className="bg-slate-50 text-left text-xs text-slate-600">
                    <tr>
                      <th className="px-3 py-2">เวลานัด</th>
                      <th className="px-3 py-2">ลูกค้า</th>
                      <th className="px-3 py-2">ช่าง</th>
                      <th className="px-3 py-2">ที่</th>
                      <th className="px-3 py-2">รวม</th>
                      <th className="px-3 py-2">ชำระ</th>
                      <th className="px-3 py-2">สถานะ</th>
                      <th className="px-3 py-2" />
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => (
                      <tr
                        key={row.id}
                        className={`border-t border-slate-100 hover:bg-sky-50/50 ${
                          selectedId === row.id ? "bg-sky-50" : ""
                        }`}
                      >
                        <td className="px-3 py-2 whitespace-nowrap text-xs">
                          {fmtDt(row.start_time)}
                        </td>
                        <td className="px-3 py-2">
                          <div className="font-medium">
                            {row.booker_name || "—"}
                          </div>
                          <div className="text-xs text-slate-500 font-mono truncate max-w-[120px]">
                            {row.booker_id.slice(0, 8)}…
                          </div>
                        </td>
                        <td className="px-3 py-2">
                          <div className="font-medium">
                            {row.talent_name || "—"}
                          </div>
                        </td>
                        <td className="px-3 py-2 text-xs">
                          {row.location_mode === "at_home"
                            ? "นอกสถานที่"
                            : "ที่ร้าน"}
                        </td>
                        <td className="px-3 py-2 font-mono text-xs">
                          {fmtThb(row.employer_total)}
                        </td>
                        <td className="px-3 py-2 text-xs">
                          {fmtThb(row.amount_paid)}
                          {row.remaining_balance > 0 ? (
                            <span className="text-amber-600">
                              {" "}
                              ค้าง {fmtThb(row.remaining_balance)}
                            </span>
                          ) : null}
                        </td>
                        <td className="px-3 py-2">
                          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs">
                            {STATUS_LABELS[row.status] || row.status}
                          </span>
                          <div className="text-[10px] text-slate-500 mt-0.5">
                            {SESSION_LABELS[row.session_status] ||
                              row.session_status}
                          </div>
                        </td>
                        <td className="px-3 py-2">
                          <button
                            type="button"
                            className="text-sky-600 text-xs font-semibold hover:underline"
                            onClick={() => void openDetail(row.id)}
                          >
                            ดู
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        {selectedId && (
          <div className="w-full max-w-md shrink-0 overflow-y-auto border-l border-slate-200 bg-white p-4 shadow-lg">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-bold text-slate-900">รายละเอียด</h2>
              <button type="button" onClick={() => setSelectedId(null)}>
                <X className="h-5 w-5 text-slate-400" />
              </button>
            </div>
            {detailLoading ? (
              <div className="flex justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-sky-600" />
              </div>
            ) : b ? (
              <div className="space-y-4 text-sm">
                <div className="rounded-lg border border-slate-200 p-3 space-y-1">
                  <p>
                    <span className="text-slate-500">ID:</span>{" "}
                    <span className="font-mono text-xs">{String(b.id)}</span>
                  </p>
                  <p>
                    {STATUS_LABELS[String(b.status)] || String(b.status)} ·{" "}
                    {SESSION_LABELS[String(b.session_status)] ||
                      String(b.session_status)}
                  </p>
                  <p className="text-slate-600">
                    {fmtDt(String(b.start_time))}
                  </p>
                </div>

                <div className="rounded-lg border border-slate-200 p-3 space-y-2">
                  <p className="font-semibold">ผู้เกี่ยวข้อง</p>
                  <p>
                    ลูกค้า: {String(b.booker_name || "—")}{" "}
                    {onOpenUser && b.booker_id ? (
                      <button
                        type="button"
                        className="text-sky-600 inline-flex items-center gap-0.5"
                        onClick={() => onOpenUser(String(b.booker_id))}
                      >
                        <ExternalLink className="h-3 w-3" /> โปรไฟล์
                      </button>
                    ) : null}
                  </p>
                  <p>
                    ช่าง: {String(b.talent_name || "—")}{" "}
                    {onOpenUser && b.talent_id ? (
                      <button
                        type="button"
                        className="text-sky-600 inline-flex items-center gap-0.5"
                        onClick={() => onOpenUser(String(b.talent_id))}
                      >
                        <ExternalLink className="h-3 w-3" /> โปรไฟล์
                      </button>
                    ) : null}
                  </p>
                </div>

                <div className="rounded-lg border border-emerald-100 bg-emerald-50/50 p-3 space-y-1 font-mono text-xs">
                  <p className="font-sans font-semibold text-emerald-900 mb-2">
                    ราคา
                  </p>
                  <p>บริการ: {fmtThb(Number(b.service_subtotal))}</p>
                  <p>ค่าเดินทาง: {fmtThb(Number(b.transport_total))}</p>
                  <p>quoted: {fmtThb(Number(b.quoted_price))}</p>
                  <p>ค่าบริการ +5%: {fmtThb(Number(b.employer_service_fee))}</p>
                  <p className="font-bold text-emerald-800">
                    รวมชำระ: {fmtThb(Number(b.employer_total))}
                  </p>
                  <p>ชำระแล้ว: {fmtThb(Number(b.amount_paid))}</p>
                  {Number(b.remaining_balance) > 0 ? (
                    <p className="text-amber-700">
                      คงเหลือ: {fmtThb(Number(b.remaining_balance))}
                    </p>
                  ) : null}
                </div>

                {payout ? (
                  <div className="rounded-lg border border-sky-100 bg-sky-50/50 p-3 space-y-1 font-mono text-xs">
                    <p className="font-sans font-semibold text-sky-900 mb-2">
                      ช่างรับ (preview)
                    </p>
                    <p>ค่าจัดหา: {fmtThb(payout.sourcingFee)}</p>
                    <p>คอมมิชชั่น: {fmtThb(payout.serviceCommission)}</p>
                    <p>
                      ค่าแพลตฟอร์มเดินทาง: {fmtThb(payout.transportPlatformFee)}
                    </p>
                    <p className="font-bold text-sky-800">
                      สุทธิ: {fmtThb(payout.talentPayout)}
                    </p>
                  </div>
                ) : null}

                {(() => {
                  let items: { title?: string; price?: number }[] = [];
                  const raw = b.selected_items_json;
                  if (Array.isArray(raw)) items = raw;
                  else if (typeof raw === "string") {
                    try {
                      items = JSON.parse(raw);
                    } catch {
                      items = [];
                    }
                  }
                  if (!items.length) return null;
                  return (
                    <div className="rounded-lg border border-slate-200 p-3">
                      <p className="font-semibold mb-1">เมนูที่เลือก</p>
                      <ul className="text-xs space-y-0.5">
                        {items.map((item, i) => (
                          <li key={i}>
                            {item.title} — {fmtThb(item.price)}
                          </li>
                        ))}
                      </ul>
                    </div>
                  );
                })()}

                {(detail?.photos || []).map((ph) => (
                  <div
                    key={ph.phase}
                    className="rounded-lg border border-slate-200 p-3"
                  >
                    <p className="font-semibold mb-2">
                      รูป{ph.phase === "before" ? "ก่อน" : "หลัง"} (
                      {ph.photo_urls?.length || 0})
                    </p>
                    <div className="grid grid-cols-3 gap-1">
                      {(ph.photo_urls || []).map((url, i) => (
                        <a
                          key={i}
                          href={url}
                          target="_blank"
                          rel="noreferrer"
                          className="aspect-square overflow-hidden rounded border"
                        >
                          <img
                            src={url}
                            alt=""
                            className="h-full w-full object-cover"
                          />
                        </a>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-slate-500">ไม่พบข้อมูล</p>
            )}
          </div>
        )}
      </div>

      {resolveTarget ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-xl bg-white p-5 shadow-xl">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="font-bold text-slate-900 flex items-center gap-2">
                <Scale className="h-5 w-5 text-rose-600" />
                ตัดสินข้อพิพาท
              </h3>
              <button type="button" onClick={() => setResolveTarget(null)}>
                <X className="h-5 w-5 text-slate-400" />
              </button>
            </div>
            <p className="text-xs text-slate-600 mb-2">
              {resolveTarget.booker_name} vs {resolveTarget.talent_name}
            </p>
            <p className="text-sm bg-slate-50 rounded p-2 mb-3">
              {resolveTarget.reason}
            </p>
            <p className="text-xs text-slate-500 mb-1">
              ชำระแล้ว {fmtThb(resolveTarget.amount_paid)}
            </p>
            <textarea
              className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm mb-3"
              rows={2}
              placeholder="หมายเหตุ (ไม่บังคับ)"
              value={resolveNote}
              onChange={(e) => setResolveNote(e.target.value)}
            />
            <div className="flex flex-col gap-2">
              <button
                type="button"
                disabled={!!resolvingId}
                onClick={() => void submitResolve("refund_customer")}
                className="rounded-lg bg-amber-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
              >
                คืนเงินลูกค้า (เต็มจำนวนที่ชำระ)
              </button>
              <button
                type="button"
                disabled={!!resolvingId}
                onClick={() => void submitResolve("release_provider")}
                className="rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
              >
                ปล่อยเงินให้ช่าง (ยอมรับงาน)
              </button>
              <button
                type="button"
                disabled={!!resolvingId}
                onClick={() => void submitResolve("reject_dispute")}
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 disabled:opacity-50"
              >
                ปฏิเสธข้อพิพาท — ให้ลูกค้ายอมรับ/โต้แย้งใหม่
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
};
