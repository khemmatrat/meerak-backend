import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Banknote,
  CheckCircle,
  ExternalLink,
  RefreshCw,
  XCircle,
} from "lucide-react";
import {
  downloadManualDepositsCsv,
  downloadWalletDepositChargesCsv,
  getAdminWalletDepositChargeDetail,
  getAdminManualDeposits,
  getAdminWalletDepositCharges,
  postAdminReconcilePaysoBatch,
  postAdminReconcilePaysoCharge,
  postAdminManualDepositApprove,
  postAdminManualDepositReject,
  type AdminWalletDepositChargeDetail,
  type AdminManualDepositRow,
  type AdminWalletDepositChargeRow,
} from "../services/adminApi";

function fmtThb(v: unknown): string {
  const n = Number(v);
  return Number.isFinite(n)
    ? n.toLocaleString("th-TH", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })
    : "-";
}

/** จาก backend rejection_reason JSON */
function parseRejection(rr: string | null | undefined): {
  message: string;
  internal_note?: string;
  code?: string;
} | null {
  if (!rr || typeof rr !== "string") return null;
  const t = rr.trim();
  if (!t.startsWith("{")) return { message: t };
  try {
    const o = JSON.parse(t) as {
      message?: string;
      internal_note?: string;
      code?: string;
    };
    const message = typeof o.message === "string" ? o.message : t;
    return {
      message,
      ...(typeof o.internal_note === "string"
        ? { internal_note: o.internal_note }
        : {}),
      ...(typeof o.code === "string" ? { code: o.code } : {}),
    };
  } catch {
    return { message: t };
  }
}

const REJECT_REASON_OPTIONS: { code: string; label: string; hint: string }[] = [
  {
    code: "NO_INBOUND_MATCH",
    label: "ไม่พบธุรกรรมเงินเข้าที่สอดคล้อง",
    hint: "เทียบกับยอด/เวลาแจ้งแล้วไม่พบรายการเข้าบัญชีเรา",
  },
  {
    code: "NOT_ATTRIBUTABLE_TO_SERVICE",
    label: "ไม่สามารถยืนยันเชื่อมโยงกับบริการ",
    hint: "ไม่ตรวจได้ว่ามาจากบัญชี/ผู้ให้บริการของเรา",
  },
  {
    code: "SLIP_MISMATCH",
    label: "สลิปไม่ตรงกับรายการเข้าจริง",
    hint: "ข้อมูลในหลักฐานไม่ตรงกับรายการเงินเข้าที่ตรวจได้จากธนาคารหรือบัญชี",
  },
  {
    code: "DOCUMENT_NOT_VERIFIABLE",
    label: "ไม่สามารถยืนยันความถูกต้องของเอกสาร",
    hint: "รวมความสงสัยเรื่องเอกสารปลอม/ถูกสร้างหรือแก้ไขโดยมิชอบ — เป็นการพิจารณาของทีม ไม่ใช่ผลจากเครื่องตรวจจับสลิป",
  },
  {
    code: "POLICY_VIOLATION",
    label: "ไม่เป็นไปตามข้อกำหนด/นโยบาย",
    hint: "กรอกหมายเหตุภายในเพิ่มได้",
  },
  {
    code: "OTHER",
    label: "อื่น ๆ (ระบุรายละเอียด)",
    hint: "บังคับกรอกข้อความอย่างน้อย 8 ตัวอักษร",
  },
];

export interface ManualDepositsViewProps {
  /** โฟกัสจาก User Management — รายการเติมเงิน gateway ค้างของ user นี้ */
  initialUserId?: string | null;
  initialGatewayStatus?: "all" | "pending" | "success" | "failed";
  onInitialFocusConsumed?: () => void;
}

export const ManualDepositsView: React.FC<ManualDepositsViewProps> = ({
  initialUserId,
  initialGatewayStatus,
  onInitialFocusConsumed,
}) => {
  const [rows, setRows] = useState<AdminManualDepositRow[]>([]);
  const [gatewayRows, setGatewayRows] = useState<AdminWalletDepositChargeRow[]>(
    [],
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [filter, setFilter] = useState<
    "all" | "manual_pending_verification" | "approved" | "rejected"
  >("manual_pending_verification");
  const [gatewaySourceFilter, setGatewaySourceFilter] = useState<
    "all" | "payso" | "ksher" | "card" | "truemoney" | "mobile_banking"
  >("all");
  const [gatewayStatusFilter, setGatewayStatusFilter] = useState<
    "all" | "pending" | "success" | "failed"
  >("all");
  const [gatewayUserIdFilter, setGatewayUserIdFilter] = useState("");
  const gatewaySectionRef = useRef<HTMLDivElement | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [rejectFor, setRejectFor] = useState<AdminManualDepositRow | null>(
    null,
  );
  const [rejectReason, setRejectReason] = useState(
    REJECT_REASON_OPTIONS[0]?.code ?? "NO_INBOUND_MATCH",
  );
  const [rejectNote, setRejectNote] = useState("");
  const [reconcilingChargeId, setReconcilingChargeId] = useState<string | null>(
    null,
  );
  const [reconcilingBatch, setReconcilingBatch] = useState(false);
  const [rowFeedback, setRowFeedback] = useState<Record<string, string>>({});
  const [detailChargeId, setDetailChargeId] = useState<string | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailData, setDetailData] =
    useState<AdminWalletDepositChargeDetail | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setNotice(null);
    try {
      const [manual, gateway] = await Promise.all([
        getAdminManualDeposits(filter === "all" ? undefined : filter),
        getAdminWalletDepositCharges({
          source_type: gatewaySourceFilter,
          status: gatewayStatusFilter,
          user_id: gatewayUserIdFilter.trim() || undefined,
          limit: 300,
        }),
      ]);
      setRows(manual.rows || []);
      setGatewayRows(gateway.rows || []);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
      setRows([]);
      setGatewayRows([]);
    } finally {
      setLoading(false);
    }
  }, [filter, gatewaySourceFilter, gatewayStatusFilter, gatewayUserIdFilter]);

  useEffect(() => {
    if (!initialUserId) return;
    setGatewayUserIdFilter(initialUserId);
    if (initialGatewayStatus) setGatewayStatusFilter(initialGatewayStatus);
    window.setTimeout(() => {
      gatewaySectionRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
      onInitialFocusConsumed?.();
    }, 300);
  }, [initialUserId, initialGatewayStatus, onInitialFocusConsumed]);

  useEffect(() => {
    void load();
  }, [load]);

  const openReject = (r: AdminManualDepositRow) => {
    setRejectFor(r);
    setRejectReason(REJECT_REASON_OPTIONS[0]?.code ?? "NO_INBOUND_MATCH");
    setRejectNote("");
    setError(null);
  };

  const onRejectConfirm = async () => {
    if (!rejectFor) return;
    setBusyId(rejectFor.id);
    setError(null);
    try {
      await postAdminManualDepositReject(rejectFor.id, {
        reason_code: rejectReason,
        note: rejectNote.trim() || undefined,
      });
      setRejectFor(null);
      setNotice("ปฏิเสธรายการเรียบร้อย");
      await load();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusyId(null);
    }
  };

  const onApprove = async (id: string) => {
    if (!confirm("อนุมัติรายการนี้และเครดิตเข้าวอลเล็ตผู้ใช้ตามยอดสลิป?"))
      return;
    const bankRefRaw = window.prompt(
      "กรอกเลขอ้างอิงธนาคาร/สลิป (bank_ref_id) — บังคับเพื่อกันซ้ำกับรายการที่อนุมัติแล้ว:",
    );
    if (bankRefRaw === null) return;
    const bankRef = bankRefRaw.trim();
    if (!bankRef) {
      setError("ต้องระบุเลขอ้างอิงธนาคาร/สลิป");
      return;
    }
    setBusyId(id);
    setError(null);
    try {
      await postAdminManualDepositApprove(id, { bank_ref_id: bankRef });
      setNotice("อนุมัติและเครดิตเข้ากระเป๋าเรียบร้อย");
      await load();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusyId(null);
    }
  };

  const onReconcilePayso = async (chargeId: string) => {
    setReconcilingChargeId(chargeId);
    setError(null);
    setNotice(null);
    setRowFeedback((prev) => ({
      ...prev,
      [chargeId]: "กำลังเช็กสถานะกับ PaySo...",
    }));
    try {
      const out = await postAdminReconcilePaysoCharge(chargeId);
      const st = String(out?.status || "").toLowerCase();
      const rec = (
        out as {
          reconcile?: {
            query?: {
              error?: string | null;
              statusCode?: number;
              method?: string | null;
              path?: string | null;
              config_warning?: string | null;
            };
            paid?: boolean;
          };
        }
      ).reconcile;
      if (st !== "success") {
        const rawErr = rec?.query?.error || null;
        const cfgWarn = rec?.query?.config_warning || null;
        if (cfgWarn) {
          const msg = `ตั้งค่าไม่ตรง endpoint ตรวจสถานะจริง: ${cfgWarn}`;
          setError(msg);
          setRowFeedback((prev) => ({ ...prev, [chargeId]: msg }));
        } else if (rawErr === "PAYSO_DEPOSIT_STATUS_PATH not configured") {
          const msg =
            "ยังตรวจสอบไม่ได้: ตั้งค่า PAYSO_DEPOSIT_STATUS_PATH/PAYSO_DEPOSIT_STATUS_METHOD ใน backend .env แล้ว restart";
          setError(msg);
          setRowFeedback((prev) => ({ ...prev, [chargeId]: msg }));
        } else if ((rec?.query?.statusCode || 0) === 405) {
          const msg = `PaySo ตอบ 405 ที่ ${rec?.query?.path || "?"} (${rec?.query?.method || "?"}) — ปรับ PAYSO_DEPOSIT_STATUS_PATH/METHOD ให้เป็น endpoint status`;
          setError(msg);
          setRowFeedback((prev) => ({ ...prev, [chargeId]: msg }));
        } else if (rawErr) {
          const msg = `ยังไม่พบสถานะสำเร็จจาก PaySo (${rawErr})`;
          setError(msg);
          setRowFeedback((prev) => ({ ...prev, [chargeId]: msg }));
        } else {
          const msg = "เช็กแล้วแต่ยัง pending";
          setRowFeedback((prev) => ({ ...prev, [chargeId]: msg }));
        }
      } else {
        setRowFeedback((prev) => ({
          ...prev,
          [chargeId]: "สำเร็จ: อัปเดตสถานะและเครดิตเรียบร้อย",
        }));
      }
      await load();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setReconcilingChargeId(null);
    }
  };

  const onReconcilePaysoBatch = async () => {
    setReconcilingBatch(true);
    setError(null);
    try {
      const out = await postAdminReconcilePaysoBatch(200);
      setNotice(
        `Batch ตรวจสอบแล้ว ${out.total} รายการ: สำเร็จ ${out.success_count}, ค้าง ${out.still_pending_count}, error ${out.error_count}`,
      );
      await load();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setReconcilingBatch(false);
    }
  };

  const openChargeDetail = async (chargeId: string) => {
    setDetailChargeId(chargeId);
    setDetailData(null);
    setDetailLoading(true);
    try {
      const d = await getAdminWalletDepositChargeDetail(chargeId);
      setDetailData(d);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setDetailLoading(false);
    }
  };

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto overflow-auto">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div className="flex items-center gap-2">
          <Banknote className="text-indigo-600" size={28} />
          <div>
            <h1 className="text-xl font-bold text-slate-900">
              เติมเงินสลิป (Manual)
            </h1>
            <p className="text-sm text-slate-500">
              รายการจากแอป —{" "}
              <code className="text-xs bg-slate-100 px-1 rounded">
                POST /api/wallet/deposit/manual
              </code>{" "}
              รอตรวจแล้วเครดิต
            </p>
            <p className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-2 py-1.5 mt-2 max-w-2xl">
              PaySo QR ไม่เข้าคิวตรวจสลิป — ดูสถานะได้ในตาราง{" "}
              <strong>PaySo QR (Gateway)</strong> ด้านล่าง
            </p>
            <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-2 py-1.5 mt-2 max-w-2xl">
              ระบบกันส่ง<strong>ไฟล์สลิปเดิมซ้ำ</strong> (hash) และ
              <strong>ไม่ให้มีคำขอรอตรวจซ้ำสำหรับยอดเดียวกัน</strong>{" "}
              (กันสลิปคนละไฟล์แต่ยอดเดียวกัน) —{" "}
              <strong>
                มาตรฐานนิ่งสุดอยู่ที่รายการเงินเข้าบัญชีเราและการคู่กับสเตทเมนต์ธนาคาร
              </strong>{" "}
              ส่วนปุ่มปฏิเสธใช้เทมเพลตข้อความสุภาพตามเหตุผลที่เลือก
              (แอดมินเป็นเจ้าของเหตุผล เหมือน workflow ธนาคาร)
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-800 text-white text-sm font-medium hover:bg-slate-700 disabled:opacity-50"
        >
          <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
          รีเฟรช
        </button>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void downloadManualDepositsCsv({ status: filter })}
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border border-slate-300 text-slate-700 text-xs font-bold hover:bg-slate-50"
          >
            Export Manual CSV
          </button>
          <button
            type="button"
            onClick={() =>
              void downloadWalletDepositChargesCsv({
                source_type: gatewaySourceFilter,
              })
            }
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border border-emerald-300 text-emerald-800 text-xs font-bold hover:bg-emerald-50"
          >
            Export Gateway CSV
          </button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 mb-4">
        {(
          [
            ["manual_pending_verification", "รอตรวจ"],
            ["approved", "อนุมัติแล้ว"],
            ["rejected", "ปฏิเสธแล้ว"],
            ["all", "ทั้งหมด"],
          ] as const
        ).map(([v, label]) => (
          <button
            key={v}
            type="button"
            onClick={() => setFilter(v)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium border ${
              filter === v
                ? "bg-indigo-600 text-white border-indigo-600"
                : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {error && (
        <div className="mb-4 p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-800 text-sm">
          {error}
        </div>
      )}
      {notice && (
        <div className="mb-4 p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm">
          {notice}
        </div>
      )}

      {loading ? (
        <p className="text-slate-500">กำลังโหลด...</p>
      ) : rows.length === 0 ? (
        <p className="text-slate-500">ไม่มีรายการ Manual</p>
      ) : (
        <div className="overflow-x-auto border border-slate-200 rounded-xl bg-white shadow-sm">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="bg-slate-50 text-left text-slate-600">
                <th className="px-3 py-2 font-semibold">เวลา</th>
                <th className="px-3 py-2 font-semibold">อีเมล</th>
                <th className="px-3 py-2 font-semibold">ยอด (บาท)</th>
                <th className="px-3 py-2 font-semibold">สถานะ</th>
                <th className="px-3 py-2 font-semibold min-w-[200px]">
                  ผลการตรวจ / เหตุผลปฏิเสธ
                </th>
                <th className="px-3 py-2 font-semibold">สลิป</th>
                <th className="px-3 py-2 font-semibold">การทำงาน</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const pending = r.status === "manual_pending_verification";
                const rejected = r.status === "rejected";
                const rej = rejected
                  ? parseRejection(r.rejection_reason)
                  : null;
                return (
                  <tr
                    key={r.id}
                    className="border-t border-slate-100 hover:bg-slate-50/80"
                  >
                    <td className="px-3 py-2 whitespace-nowrap text-slate-700">
                      {r.created_at
                        ? new Date(r.created_at).toLocaleString("th-TH")
                        : "-"}
                    </td>
                    <td
                      className="px-3 py-2 max-w-[200px] truncate"
                      title={r.user_email || ""}
                    >
                      {r.user_email || r.user_id?.slice(0, 8) || "-"}
                    </td>
                    <td className="px-3 py-2 font-mono font-semibold">
                      ฿{fmtThb(r.amount)}
                    </td>
                    <td className="px-3 py-2">
                      <span
                        className={`inline-flex px-2 py-0.5 rounded-full text-xs font-bold ${
                          pending
                            ? "bg-amber-100 text-amber-900 border border-amber-300"
                            : rejected
                              ? "bg-slate-200 text-slate-800 border border-slate-300"
                              : "bg-emerald-100 text-emerald-900 border border-emerald-300"
                        }`}
                      >
                        {r.status}
                      </span>
                      {rejected && r.reviewed_at && (
                        <div className="text-[11px] text-slate-500 mt-1">
                          ตรวจเมื่อ{" "}
                          {new Date(r.reviewed_at).toLocaleString("th-TH")}
                          {r.reviewed_by ? ` · ${r.reviewed_by}` : ""}
                        </div>
                      )}
                      {r.bank_ref_id && !rejected ? (
                        <div className="text-[11px] text-emerald-800 mt-0.5 font-mono">
                          ref {r.bank_ref_id}
                        </div>
                      ) : null}
                    </td>
                    <td className="px-3 py-2 text-xs text-slate-700 max-w-xs">
                      {rejected && rej?.message ? (
                        <span className="block leading-snug whitespace-pre-wrap">
                          {rej.message}
                        </span>
                      ) : !pending && !rejected && r.bank_ref_id ? (
                        <span className="text-emerald-800">
                          บันทึกอนุมัติแล้ว
                        </span>
                      ) : pending ? (
                        <span className="text-slate-400">—</span>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                      {rejected && rej?.internal_note && (
                        <details className="mt-1 text-[11px] text-slate-500">
                          <summary className="cursor-pointer hover:text-slate-700">
                            หมายเหตุภายใน
                          </summary>
                          <span className="block mt-0.5">
                            {rej.internal_note}
                          </span>
                        </details>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      {r.slip_url ? (
                        <a
                          href={r.slip_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-indigo-600 hover:underline"
                        >
                          เปิดสลิป <ExternalLink size={14} />
                        </a>
                      ) : (
                        "-"
                      )}
                    </td>
                    <td className="px-3 py-2">
                      {pending ? (
                        <div className="flex flex-wrap gap-1.5">
                          <button
                            type="button"
                            disabled={busyId === r.id}
                            onClick={() => void onApprove(r.id)}
                            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-bold hover:bg-emerald-700 disabled:opacity-50"
                          >
                            <CheckCircle size={14} />
                            {busyId === r.id
                              ? "กำลังดำเนินการ..."
                              : "อนุมัติ + เครดิต"}
                          </button>
                          <button
                            type="button"
                            disabled={busyId === r.id}
                            onClick={() => openReject(r)}
                            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-rose-300 bg-white text-rose-800 text-xs font-bold hover:bg-rose-50 disabled:opacity-50"
                          >
                            <XCircle size={14} />
                            ปฏิเสธ...
                          </button>
                        </div>
                      ) : (
                        <span className="text-xs text-slate-400">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <div className="mt-8" ref={gatewaySectionRef}>
        <div className="flex items-center justify-between gap-3 mb-2">
          <h2 className="text-lg font-bold text-slate-900">
            Gateway Deposits (PaySo/Card/TrueMoney/Mobile Banking)
          </h2>
          <div className="flex flex-wrap items-center gap-2">
            {gatewayUserIdFilter ? (
              <span className="text-xs bg-amber-100 text-amber-900 px-2 py-1 rounded-lg">
                user: {gatewayUserIdFilter.slice(0, 8)}…
                <button
                  type="button"
                  className="ml-2 underline"
                  onClick={() => setGatewayUserIdFilter("")}
                >
                  ล้าง
                </button>
              </span>
            ) : null}
            <select
              value={gatewayStatusFilter}
              onChange={(e) =>
                setGatewayStatusFilter(
                  e.target.value as typeof gatewayStatusFilter,
                )
              }
              className="text-xs border border-slate-300 rounded-lg px-2 py-1.5"
            >
              <option value="all">ทุกสถานะ</option>
              <option value="pending">Pending</option>
              <option value="success">Success</option>
              <option value="failed">Failed</option>
            </select>
            <select
              value={gatewaySourceFilter}
              onChange={(e) =>
                setGatewaySourceFilter(
                  e.target.value as typeof gatewaySourceFilter,
                )
              }
              className="text-xs border border-slate-300 rounded-lg px-2 py-1.5"
            >
              <option value="all">ทุกช่องทาง</option>
              <option value="payso">PaySo</option>
              <option value="ksher">Ksher</option>
              <option value="card">Card</option>
              <option value="truemoney">TrueMoney</option>
              <option value="mobile_banking">Mobile Banking</option>
            </select>
            <button
              type="button"
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border border-emerald-300 text-emerald-800 text-xs font-bold hover:bg-emerald-50 disabled:opacity-50"
              onClick={() => void onReconcilePaysoBatch()}
              disabled={reconcilingBatch}
            >
              {reconcilingBatch
                ? "กำลังเช็กทั้งหมด..."
                : "เช็ก PaySo ทั้งหมด (Pending)"}
            </button>
          </div>
        </div>
        <p className="text-xs text-slate-500 mb-3">
          แหล่งข้อมูลจาก{" "}
          <code className="text-[11px] bg-slate-100 px-1 rounded">
            wallet_deposit_charges
          </code>{" "}
          ผ่าน{" "}
          <code className="text-[11px] bg-slate-100 px-1 rounded">
            GET /api/admin/wallet-deposit-charges
          </code>{" "}
          + webhook logs/timeline
        </p>
        {gatewayRows.length === 0 ? (
          <p className="text-slate-500 text-sm">ยังไม่มีรายการ PaySo</p>
        ) : (
          <div className="overflow-x-auto border border-emerald-200 rounded-xl bg-white shadow-sm">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="bg-emerald-50 text-left text-slate-700">
                  <th className="px-3 py-2 font-semibold">เวลา</th>
                  <th className="px-3 py-2 font-semibold">ผู้ใช้</th>
                  <th className="px-3 py-2 font-semibold">ช่องทาง</th>
                  <th className="px-3 py-2 font-semibold">ยอด</th>
                  <th className="px-3 py-2 font-semibold">สถานะ</th>
                  <th className="px-3 py-2 font-semibold">Charge ID</th>
                  <th className="px-3 py-2 font-semibold">Ledger</th>
                  <th className="px-3 py-2 font-semibold">ตรวจสอบ/หลักฐาน</th>
                </tr>
              </thead>
              <tbody>
                {gatewayRows.map((r) => (
                  <tr key={r.charge_id} className="border-t border-emerald-100">
                    <td className="px-3 py-2 whitespace-nowrap text-slate-700">
                      {r.created_at
                        ? new Date(r.created_at).toLocaleString("th-TH")
                        : "-"}
                    </td>
                    <td
                      className="px-3 py-2 max-w-[220px] truncate"
                      title={r.user_email || ""}
                    >
                      {r.user_email || r.user_id?.slice(0, 8) || "-"}
                    </td>
                    <td className="px-3 py-2 text-xs font-semibold uppercase">
                      {r.source_type || "-"}
                    </td>
                    <td className="px-3 py-2 font-mono font-semibold">
                      ฿{fmtThb(r.amount)} {r.currency || "THB"}
                    </td>
                    <td className="px-3 py-2">
                      <span
                        className={`inline-flex px-2 py-0.5 rounded-full text-xs font-bold ${
                          r.status === "success"
                            ? "bg-emerald-100 text-emerald-900 border border-emerald-300"
                            : r.status === "failed" || r.status === "expired"
                              ? "bg-rose-100 text-rose-900 border border-rose-300"
                              : "bg-amber-100 text-amber-900 border border-amber-300"
                        }`}
                      >
                        {r.status}
                      </span>
                    </td>
                    <td className="px-3 py-2 font-mono text-xs">
                      {r.charge_id}
                    </td>
                    <td className="px-3 py-2 font-mono text-xs">
                      {r.ledger_id || "-"}
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex flex-wrap items-center gap-1.5">
                        {r.status === "pending" &&
                        (r.source_type === "payso" ||
                          r.source_type === "ksher") ? (
                          <button
                            type="button"
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-emerald-300 text-emerald-800 text-xs font-bold hover:bg-emerald-50 disabled:opacity-50"
                            onClick={() => void onReconcilePayso(r.charge_id)}
                            disabled={reconcilingChargeId === r.charge_id}
                          >
                            {reconcilingChargeId === r.charge_id
                              ? "กำลังตรวจ..."
                              : "เช็ก PaySo"}
                          </button>
                        ) : (
                          <span className="text-xs text-slate-400">-</span>
                        )}
                        <button
                          type="button"
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-300 text-slate-700 text-xs font-bold hover:bg-slate-50"
                          onClick={() => void openChargeDetail(r.charge_id)}
                        >
                          Timeline
                        </button>
                      </div>
                      {rowFeedback[r.charge_id] && (
                        <div className="mt-1 text-[11px] text-slate-600 max-w-[260px] leading-snug">
                          {rowFeedback[r.charge_id]}
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {detailChargeId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-[1px]">
          <div className="bg-white rounded-2xl shadow-xl max-w-4xl w-full border border-slate-200 overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100 bg-slate-50 flex items-start justify-between gap-3">
              <div>
                <h2 className="font-bold text-slate-900">Charge Timeline</h2>
                <p className="text-xs text-slate-600 mt-1 font-mono">
                  {detailChargeId}
                </p>
              </div>
              <button
                type="button"
                className="shrink-0 text-slate-500 hover:text-slate-900"
                onClick={() => {
                  setDetailChargeId(null);
                  setDetailData(null);
                }}
              >
                ×
              </button>
            </div>
            <div className="px-5 py-4 max-h-[75vh] overflow-y-auto space-y-4">
              {detailLoading ? (
                <p className="text-sm text-slate-500">กำลังโหลดรายละเอียด...</p>
              ) : !detailData ? (
                <p className="text-sm text-slate-500">ไม่พบข้อมูลรายละเอียด</p>
              ) : (
                <>
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-3 text-sm">
                    <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
                      <p className="text-xs text-slate-500">User</p>
                      <p className="font-medium">
                        {detailData.charge.user_email ||
                          detailData.charge.user_id}
                      </p>
                    </div>
                    <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
                      <p className="text-xs text-slate-500">Amount</p>
                      <p className="font-medium">
                        ฿{fmtThb(detailData.charge.amount)}
                      </p>
                    </div>
                    <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
                      <p className="text-xs text-slate-500">Source</p>
                      <p className="font-medium uppercase">
                        {detailData.charge.source_type}
                      </p>
                    </div>
                    <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
                      <p className="text-xs text-slate-500">Status</p>
                      <p className="font-medium">{detailData.charge.status}</p>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <h3 className="text-sm font-bold text-slate-800">
                      Timeline
                    </h3>
                    {detailData.timeline?.length ? (
                      detailData.timeline.map((t, idx) => (
                        <div
                          key={`${t.at || "na"}-${idx}`}
                          className="p-3 rounded-lg border border-slate-200 bg-white"
                        >
                          <div className="flex items-center justify-between gap-3">
                            <p className="font-semibold text-sm text-slate-800">
                              {t.title}
                            </p>
                            <p className="text-[11px] text-slate-500">
                              {t.at
                                ? new Date(t.at).toLocaleString("th-TH")
                                : "-"}
                            </p>
                          </div>
                          <p className="text-[11px] text-slate-500 uppercase mt-1">
                            {t.source}
                          </p>
                        </div>
                      ))
                    ) : (
                      <p className="text-xs text-slate-500">ไม่มี timeline</p>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {rejectFor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-[1px]">
          <div
            role="dialog"
            aria-labelledby="reject-title"
            className="bg-white rounded-2xl shadow-xl max-w-lg w-full border border-slate-200 overflow-hidden"
          >
            <div className="px-5 py-4 border-b border-slate-100 bg-slate-50 flex items-start justify-between gap-3">
              <div>
                <h2 id="reject-title" className="font-bold text-slate-900">
                  ปฏิเสธรายการเติมเงิน (สลิป)
                </h2>
                <p className="text-xs text-slate-600 mt-1">
                  ข้อความที่ผู้ใช้จะได้รับจากรูปแบบมาตรฐานด้านล่าง —
                  เลือกเหตุผลอย่างรอบคอบ และใช้หมายเหตุภายในสำหรับธนาคาร ref /
                  settlement เท่านั้น (ไม่ฝังข้อความคุยส่วนตัวใน message
                  ผู้ใช้ยกเว้นเหตุผล <strong>อื่น ๆ</strong>)
                </p>
              </div>
              <button
                type="button"
                aria-label="ปิด"
                className="shrink-0 text-slate-500 hover:text-slate-900"
                onClick={() => !busyId && setRejectFor(null)}
                disabled={!!busyId}
              >
                ×
              </button>
            </div>
            <div className="px-5 py-4 space-y-4 max-h-[70vh] overflow-y-auto">
              <div className="text-sm text-slate-700 space-y-0.5">
                <div>
                  <span className="text-slate-500">ผู้ขอ:</span>{" "}
                  {rejectFor.user_email || rejectFor.user_id?.slice(0, 8)}
                </div>
                <div>
                  <span className="text-slate-500">ยอด:</span>{" "}
                  <span className="font-mono font-semibold">
                    ฿{fmtThb(rejectFor.amount)}
                  </span>
                </div>
              </div>
              <label className="block text-xs font-semibold text-slate-700">
                เหตุผลที่ปฏิเสธ
              </label>
              <select
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                disabled={!!busyId}
              >
                {REJECT_REASON_OPTIONS.map((opt) => (
                  <option key={opt.code} value={opt.code}>
                    {opt.label}
                  </option>
                ))}
              </select>
              <p className="text-[11px] text-slate-500 -mt-2">
                {REJECT_REASON_OPTIONS.find((o) => o.code === rejectReason)
                  ?.hint ?? ""}
              </p>
              <label className="block text-xs font-semibold text-slate-700">
                หมายเหตุภายใน (ถ้ามี)
                {rejectReason !== "OTHER"
                  ? " · ถ้ากรอก จะบันทึกแยกจากข้อความหลัก"
                  : " · เหตุผลอื่น ๆ ต้องกรอก"}
              </label>
              <textarea
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm min-h-[88px]"
                placeholder={
                  rejectReason === "OTHER"
                    ? "อธิบายเหตุผลอย่างน้อย 8 ตัวอักษร เช่น ลูกค้าแจ้งโอนคนละบัญชีกับที่ตรวจได้"
                    : "เช่น รายการ bank ref XYZ ไม่ตรงกับยอดนี้ (ไม่บังคับ)"
                }
                value={rejectNote}
                onChange={(e) => setRejectNote(e.target.value)}
                disabled={!!busyId}
              />
            </div>
            <div className="px-5 py-3 border-t border-slate-100 flex justify-end gap-2 bg-white">
              <button
                type="button"
                className="px-4 py-2 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-50"
                onClick={() => setRejectFor(null)}
                disabled={!!busyId}
              >
                ยกเลิก
              </button>
              <button
                type="button"
                className="px-4 py-2 rounded-lg text-sm font-bold bg-rose-600 text-white hover:bg-rose-700 disabled:opacity-50"
                onClick={() => void onRejectConfirm()}
                disabled={!!busyId}
              >
                {busyId === rejectFor.id ? "กำลังบันทึก..." : "ยืนยันปฏิเสธ"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
