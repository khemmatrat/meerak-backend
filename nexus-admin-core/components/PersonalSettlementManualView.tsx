import React, { useMemo, useState, useCallback, useEffect } from "react";
import {
  AlertTriangle,
  Building2,
  Download,
  QrCode,
  Smartphone,
  ArrowDownLeft,
  ArrowUpRight,
  Plus,
  Save,
  Shield,
  BookOpen,
  RefreshCw,
  Upload,
  Link2,
  FileText,
} from "lucide-react";
import type { AdminRole } from "../types";
import type {
  ManualSettlementChannel,
  ManualSettlementDirection,
  ManualSettlementRecord,
} from "../types";
import {
  addManualSettlementRecord,
  exportRecordsCsv,
  getPersonalSettlementAccount,
  listManualSettlementRecords,
  updateManualSettlementRecord,
  upsertPersonalSettlementAccount,
} from "../services/personalSettlementStore";
import {
  getPersonalSettlementAccountApi,
  putPersonalSettlementAccountApi,
  getPersonalSettlementRecordsApi,
  postPersonalSettlementRecordApi,
  patchPersonalSettlementRecordApi,
  uploadPersonalSettlementSlip,
  getAuditLogs,
  type AuditLogRow,
} from "../services/adminApi";
import { useFinanceRuntime } from "../context/FinanceRuntimeContext";

const CHANNEL_OPTIONS: { value: ManualSettlementChannel; label: string; hint: string }[] = [
  { value: "QR_PROMPTPAY", label: "พร้อมเพย์ (QR / เลขพร้อมเพย์)", hint: "ลูกค้าสแกนจ่าย หรือโอนเข้าเลขพร้อมเพย์" },
  { value: "QR_BANK_STATIC", label: "QR ธนาคาร (คงที่)", hint: "QR รับเงินจากแอปธนาคาร" },
  { value: "MOBILE_BANKING_TRANSFER", label: "โอนผ่านแอปธนาคาร", hint: "โอนเข้า/ออกผ่าน SCB / KBank / ฯลฯ" },
  { value: "OTHER", label: "อื่นๆ", hint: "ATM / เคาน์เตอร์ ฯลฯ" },
];

/** แก้ไขได้: ADMIN (บทบาทหลักในระบบ), SUPER_ADMIN, ACCOUNTANT — AUDITOR ดูอย่างเดียว */
function canEditFinance(role: AdminRole | string): boolean {
  const r = String(role || "").toUpperCase();
  return r === "ADMIN" || r === "SUPER_ADMIN" || r === "ACCOUNTANT";
}

function fmtMoney(n: number): string {
  return n.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export const PersonalSettlementManualView: React.FC<{
  currentUserRole: AdminRole;
  currentUserName?: string;
}> = ({ currentUserRole, currentUserName }) => {
  const editable = canEditFinance(currentUserRole);
  const { config: financeRuntime } = useFinanceRuntime();
  const policyDisabled = financeRuntime?.personal_settlement_manual_enabled === false;
  /** แก้ไขได้เมื่อมีสิทธิ์และไม่ถูกปิดจาก runtime config */
  const canMutate = editable && !policyDisabled;

  const [records, setRecords] = useState<ManualSettlementRecord[]>(() => listManualSettlementRecords());
  const [serverSync, setServerSync] = useState<"idle" | "loading" | "ok" | "offline">("idle");
  const [syncMessage, setSyncMessage] = useState<string | null>(null);

  const [form, setForm] = useState(() => {
    const a = getPersonalSettlementAccount();
    return {
      label: a?.label ?? "บัญชีรับชั่วคราว (ก่อน Gateway)",
      bankName: a?.bankName ?? "",
      accountHolderName: a?.accountHolderName ?? "",
      accountNumber: a?.accountNumber ?? "",
      promptPayId: a?.promptPayId ?? "",
      preferredMobileBankApps: a?.preferredMobileBankApps ?? "",
      notes: a?.notes ?? "",
    };
  });

  const [addOpen, setAddOpen] = useState(false);
  const [addDirection, setAddDirection] = useState<ManualSettlementDirection>("INBOUND");
  const [addChannel, setAddChannel] = useState<ManualSettlementChannel>("QR_PROMPTPAY");
  const [addAmount, setAddAmount] = useState("");
  const [addRef, setAddRef] = useState("");
  const [addBankRef, setAddBankRef] = useState("");
  const [addTransferAt, setAddTransferAt] = useState("");
  const [addNotes, setAddNotes] = useState("");
  const [addSlipUrl, setAddSlipUrl] = useState("");
  const [uploadingSlip, setUploadingSlip] = useState(false);

  const [auditRows, setAuditRows] = useState<AuditLogRow[]>([]);

  const refreshFromServer = useCallback(async () => {
    setServerSync("loading");
    setSyncMessage(null);
    try {
      const [accRes, recRes] = await Promise.all([
        getPersonalSettlementAccountApi(),
        getPersonalSettlementRecordsApi({ limit: 500 }),
      ]);
      if (accRes.account) {
        const a = accRes.account;
        setForm({
          label: a.label,
          bankName: a.bankName,
          accountHolderName: a.accountHolderName,
          accountNumber: a.accountNumber,
          promptPayId: a.promptPayId ?? "",
          preferredMobileBankApps: a.preferredMobileBankApps ?? "",
          notes: a.notes ?? "",
        });
      }
      setRecords(recRes.records || []);
      setServerSync("ok");

      const [logA, logB] = await Promise.all([
        getAuditLogs({ entity_type: "personal_settlement_record", limit: 25 }).catch(() => ({
          logs: [],
        })),
        getAuditLogs({ entity_type: "personal_settlement_account", limit: 15 }).catch(() => ({
          logs: [],
        })),
      ]);
      const merged = [...(logA.logs || []), ...(logB.logs || [])].sort(
        (x, y) => new Date(y.created_at || 0).getTime() - new Date(x.created_at || 0).getTime()
      );
      setAuditRows(merged.slice(0, 40));
    } catch (e) {
      setServerSync("offline");
      setSyncMessage(e instanceof Error ? e.message : "โหลดจาก API ไม่สำเร็จ — ใช้ข้อมูลในเบราว์เซอร์");
      setRecords(listManualSettlementRecords());
      const a = getPersonalSettlementAccount();
      if (a) {
        setForm({
          label: a.label,
          bankName: a.bankName,
          accountHolderName: a.accountHolderName,
          accountNumber: a.accountNumber,
          promptPayId: a.promptPayId ?? "",
          preferredMobileBankApps: a.preferredMobileBankApps ?? "",
          notes: a.notes ?? "",
        });
      }
    }
  }, []);

  useEffect(() => {
    void refreshFromServer();
  }, [refreshFromServer]);

  const refreshLocalOnly = useCallback(() => {
    setRecords(listManualSettlementRecords());
    const a = getPersonalSettlementAccount();
    if (a) {
      setForm({
        label: a.label,
        bankName: a.bankName,
        accountHolderName: a.accountHolderName,
        accountNumber: a.accountNumber,
        promptPayId: a.promptPayId ?? "",
        preferredMobileBankApps: a.preferredMobileBankApps ?? "",
        notes: a.notes ?? "",
      });
    }
  }, []);

  const saveAccount = async () => {
    if (!canMutate) return;
    if (serverSync === "ok") {
      try {
        await putPersonalSettlementAccountApi({
          label: form.label,
          bankName: form.bankName,
          accountHolderName: form.accountHolderName,
          accountNumber: form.accountNumber,
          promptPayId: form.promptPayId || undefined,
          preferredMobileBankApps: form.preferredMobileBankApps || undefined,
          notes: form.notes || undefined,
        });
        upsertPersonalSettlementAccount({
          label: form.label,
          bankName: form.bankName,
          accountHolderName: form.accountHolderName,
          accountNumber: form.accountNumber,
          promptPayId: form.promptPayId || undefined,
          preferredMobileBankApps: form.preferredMobileBankApps || undefined,
          notes: form.notes || undefined,
        });
        await refreshFromServer();
        alert("บันทึกข้อมูลบัญชีแล้ว (เซิร์ฟเวอร์ + สำรองในเบราว์เซอร์)");
        return;
      } catch (err) {
        alert(err instanceof Error ? err.message : "บันทึก API ล้มเหลว");
        return;
      }
    }
    upsertPersonalSettlementAccount({
      label: form.label,
      bankName: form.bankName,
      accountHolderName: form.accountHolderName,
      accountNumber: form.accountNumber,
      promptPayId: form.promptPayId || undefined,
      preferredMobileBankApps: form.preferredMobileBankApps || undefined,
      notes: form.notes || undefined,
    });
    refreshLocalOnly();
    alert("บันทึกในเบราว์เซอร์เท่านั้น — เชื่อม API ไม่ได้");
  };

  const submitRecord = async () => {
    if (!canMutate) return;
    const amount = parseFloat(addAmount.replace(/,/g, ""));
    if (!Number.isFinite(amount) || amount <= 0) {
      alert("กรุณากรอกจำนวนเงินที่ถูกต้อง");
      return;
    }
    if (!addRef.trim()) {
      alert("กรุณากรอกคำอ้างอิง (เช่น เลขงาน / ชื่อผู้โอน)");
      return;
    }
    const transferAt =
      addTransferAt && addTransferAt.trim()
        ? new Date(addTransferAt).toISOString()
        : undefined;

    if (serverSync === "ok") {
      try {
        await postPersonalSettlementRecordApi({
          direction: addDirection,
          channel: addChannel,
          amount,
          currency: "THB",
          referenceLabel: addRef.trim(),
          bankReference: addBankRef.trim() || undefined,
          transferAt,
          status: "PENDING_RECONCILE",
          notes: addNotes.trim() || undefined,
          slipUrl: addSlipUrl.trim() || undefined,
          createdBy: currentUserName,
        });
        setAddAmount("");
        setAddRef("");
        setAddBankRef("");
        setAddTransferAt("");
        setAddNotes("");
        setAddSlipUrl("");
        setAddOpen(false);
        await refreshFromServer();
        return;
      } catch (err) {
        const msg = err instanceof Error ? err.message : "บันทึกล้มเหลว";
        alert(msg);
        return;
      }
    }

    addManualSettlementRecord({
      direction: addDirection,
      channel: addChannel,
      amount,
      currency: "THB",
      referenceLabel: addRef.trim(),
      bankReference: addBankRef.trim() || undefined,
      transferAt,
      status: "PENDING_RECONCILE",
      notes: addNotes.trim() || undefined,
      slipUrl: addSlipUrl.trim() || undefined,
      createdBy: currentUserName,
    });
    setAddAmount("");
    setAddRef("");
    setAddBankRef("");
    setAddTransferAt("");
    setAddNotes("");
    setAddSlipUrl("");
    setAddOpen(false);
    refreshLocalOnly();
  };

  const onStatusChange = async (r: ManualSettlementRecord, st: ManualSettlementRecord["status"]) => {
    if (!canMutate) return;
    if (serverSync === "ok") {
      try {
        await patchPersonalSettlementRecordApi(r.id, { status: st });
        await refreshFromServer();
      } catch (err) {
        alert(err instanceof Error ? err.message : "อัปเดตล้มเหลว");
      }
      return;
    }
    updateManualSettlementRecord(r.id, { status: st });
    refreshLocalOnly();
  };

  const importFromBrowser = async () => {
    if (!canMutate) return;
    if (serverSync !== "ok") {
      alert("ต้องเชื่อม API สำเร็จก่อน (รัน migration 153 บน DB แล้วลองรีเฟรช)");
      return;
    }
    const localAcc = getPersonalSettlementAccount();
    const localRecs = listManualSettlementRecords();
    if (!localAcc && localRecs.length === 0) {
      alert("ไม่มีข้อมูลใน localStorage");
      return;
    }
    try {
      if (localAcc) {
        await putPersonalSettlementAccountApi({
          label: localAcc.label,
          bankName: localAcc.bankName,
          accountHolderName: localAcc.accountHolderName,
          accountNumber: localAcc.accountNumber,
          promptPayId: localAcc.promptPayId,
          preferredMobileBankApps: localAcc.preferredMobileBankApps,
          notes: localAcc.notes,
        });
      }
      for (const row of localRecs) {
        try {
          await postPersonalSettlementRecordApi({
            direction: row.direction,
            channel: row.channel,
            amount: row.amount,
            currency: "THB",
            referenceLabel: row.referenceLabel,
            bankReference: row.bankReference,
            transferAt: row.transferAt,
            status: row.status,
            notes: row.notes,
            slipUrl: row.slipUrl,
            idempotencyKey: `local_${row.id}`,
            createdBy: row.createdBy || currentUserName,
          });
        } catch {
          /* ข้ามรายการซ้ำ (409) */
        }
      }
      await refreshFromServer();
      alert("นำเข้าจากเบราว์เซอร์แล้ว — ตรวจสอบรายการซ้ำด้วยเลขอ้างอิงธนาคาร");
    } catch (e) {
      alert(e instanceof Error ? e.message : "นำเข้าล้มเหลว");
    }
  };

  const onSlipFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f || !canMutate) return;
    if (serverSync !== "ok") {
      alert("อัปโหลดสลิปได้เมื่อเชื่อม API แล้วเท่านั้น");
      return;
    }
    setUploadingSlip(true);
    try {
      const { url } = await uploadPersonalSettlementSlip(f);
      setAddSlipUrl(url);
    } catch (err) {
      alert(err instanceof Error ? err.message : "อัปโหลดล้มเหลว");
    } finally {
      setUploadingSlip(false);
    }
  };

  const inboundTotal = useMemo(
    () => records.filter((r) => r.direction === "INBOUND").reduce((s, r) => s + r.amount, 0),
    [records]
  );
  const outboundTotal = useMemo(
    () => records.filter((r) => r.direction === "OUTBOUND").reduce((s, r) => s + r.amount, 0),
    [records]
  );

  const downloadCsv = () => {
    if (serverSync === "ok" && records.length > 0) {
      const header = [
        "id",
        "direction",
        "channel",
        "amount",
        "currency",
        "referenceLabel",
        "bankReference",
        "transferAt",
        "status",
        "notes",
        "slipUrl",
        "createdAt",
        "createdBy",
      ];
      const lines = [header.join(",")];
      for (const r of records) {
        const esc = (s: string | undefined) => `"${String(s ?? "").replace(/"/g, '""')}"`;
        lines.push(
          [
            r.id,
            r.direction,
            r.channel,
            r.amount,
            r.currency,
            esc(r.referenceLabel),
            esc(r.bankReference),
            esc(r.transferAt),
            r.status,
            esc(r.notes),
            esc(r.slipUrl),
            r.createdAt,
            esc(r.createdBy),
          ].join(",")
        );
      }
      const csv = lines.join("\n");
      const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `personal-settlement-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      return;
    }
    const csv = exportRecordsCsv();
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `personal-settlement-local-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="mx-auto max-w-6xl space-y-8 pb-8">
      {policyDisabled ? (
        <div className="rounded-xl border-2 border-rose-300 bg-rose-50 px-4 py-4 text-rose-950 shadow-sm">
          <p className="font-bold">บัญชีรับชั่วคราวถูกปิดจากการตั้งค่าระบบ</p>
          <p className="mt-1 text-sm">
            ใช้ Payment Gateway / AQOND Gateway แทน — เปิดได้ที่เมนู &quot;การเงินเรียลไทม์ &amp; เกตเวย์สำรอง&quot; (ADMIN)
          </p>
        </div>
      ) : null}
      {syncMessage ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          {syncMessage}
        </div>
      ) : null}

      {/* คำเตือนกฎหมาย / ปฏิบัติการ */}
      <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-amber-950 shadow-sm">
        <div className="flex gap-3">
          <AlertTriangle className="mt-0.5 h-6 w-6 shrink-0 text-amber-600" />
          <div className="space-y-2 text-sm leading-relaxed">
            <p className="font-semibold">โหมดชั่วคราว — รออนุมัติ Payment Gateway</p>
            <p>
              การใช้บัญชีส่วนบุคคลรับรายได้ของธุรกิจอาจกระทบภาษี การตรวจบัญชี และ PDPA
              ควรบันทึกทุกรายการให้สอดคล้องกับหลักฐานโอน (สลิป / SMS / Statement) และย้ายไปบัญชีบริษัทหรือ Gateway
              ทันทีที่พร้อม
            </p>
            <p className="text-xs text-amber-900/90">
              {serverSync === "ok"
                ? "ข้อมูลบัญชีและรายการถูกเก็บที่เซิร์ฟเวอร์ (มี audit) — มีสำรองในเบราว์เซอร์เมื่อกดบันทึก"
                : serverSync === "loading"
                ? "กำลังโหลดจาก API…"
                : "เชื่อม API ไม่ได้ — ใช้ข้อมูลในเบราว์เซอร์ชั่วคราว รัน migration 153 บน PostgreSQL แล้วรีเฟรช"}
            </p>
            <div className="flex flex-wrap gap-2 pt-1">
              <button
                type="button"
                onClick={() => void refreshFromServer()}
                className="inline-flex items-center gap-1 rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-xs font-medium text-amber-950 hover:bg-amber-100"
              >
                <RefreshCw size={14} />
                รีเฟรชจาก API
              </button>
              {canMutate && serverSync === "ok" ? (
                <button
                  type="button"
                  onClick={() => void importFromBrowser()}
                  className="inline-flex items-center gap-1 rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-xs font-medium text-amber-950 hover:bg-amber-100"
                >
                  นำเข้าจากเบราว์เซอร์ (ครั้งเดียว)
                </button>
              ) : null}
            </div>
          </div>
        </div>
      </div>

      {/* สรุป */}
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase text-slate-500">รับเข้า (สะสมในระบบบันทึก)</p>
          <p className="mt-1 text-2xl font-bold text-emerald-700">{fmtMoney(inboundTotal)} ฿</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase text-slate-500">จ่ายออก / โอนออก</p>
          <p className="mt-1 text-2xl font-bold text-rose-700">{fmtMoney(outboundTotal)} ฿</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase text-slate-500">สุทธิ (บันทึก)</p>
          <p className="mt-1 text-2xl font-bold text-slate-900">
            {fmtMoney(inboundTotal - outboundTotal)} ฿
          </p>
        </div>
      </div>

      {/* บัญชีรับชั่วคราว */}
      <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <h2 className="flex items-center gap-2 text-lg font-bold text-slate-900">
            <Building2 className="text-indigo-600" size={22} />
            บัญชีธนาคาร / พร้อมเพย์ที่ใช้รับชั่วคราว
          </h2>
          {policyDisabled ? (
            <span className="rounded-full bg-rose-100 px-3 py-1 text-xs font-medium text-rose-800">
              ปิดการใช้งานจากระบบ
            </span>
          ) : !editable ? (
            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">
              ดูอย่างเดียว (ต้อง ADMIN / SUPER_ADMIN / ACCOUNTANT เพื่อแก้ไข)
            </span>
          ) : null}
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <label className="block text-sm">
            <span className="text-slate-600">ชื่อเรียกภายใน</span>
            <input
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2"
              value={form.label}
              disabled={!canMutate}
              onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))}
            />
          </label>
          <label className="block text-sm">
            <span className="text-slate-600">ธนาคาร</span>
            <input
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2"
              value={form.bankName}
              disabled={!canMutate}
              placeholder="เช่น ธ.กสิกรไทย"
              onChange={(e) => setForm((f) => ({ ...f, bankName: e.target.value }))}
            />
          </label>
          <label className="block text-sm">
            <span className="text-slate-600">ชื่อบัญชี</span>
            <input
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2"
              value={form.accountHolderName}
              disabled={!canMutate}
              onChange={(e) => setForm((f) => ({ ...f, accountHolderName: e.target.value }))}
            />
          </label>
          <label className="block text-sm">
            <span className="text-slate-600">เลขบัญชี</span>
            <input
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 font-mono"
              value={form.accountNumber}
              disabled={!canMutate}
              onChange={(e) => setForm((f) => ({ ...f, accountNumber: e.target.value }))}
            />
          </label>
          <label className="block text-sm md:col-span-2">
            <span className="flex items-center gap-2 text-slate-600">
              <QrCode size={16} className="text-violet-600" />
              พร้อมเพย์ (เลขบัตรประชาชน / เบอร์มือถือ — สำหรับรับผ่าน QR / โอนเข้า)
            </span>
            <input
              className="mt-1 w-full max-w-md rounded-lg border border-slate-200 px-3 py-2 font-mono"
              value={form.promptPayId}
              disabled={!canMutate}
              placeholder="0812345678"
              onChange={(e) => setForm((f) => ({ ...f, promptPayId: e.target.value }))}
            />
          </label>
          <label className="block text-sm md:col-span-2">
            <span className="flex items-center gap-2 text-slate-600">
              <Smartphone size={16} className="text-sky-600" />
              แอปธนาคารที่ใช้บ่อย (สำหรับโอนเข้า/ออก)
            </span>
            <input
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2"
              value={form.preferredMobileBankApps}
              disabled={!canMutate}
              placeholder="เช่น K PLUS, SCB EASY, กรุงไทย NEXT"
              onChange={(e) => setForm((f) => ({ ...f, preferredMobileBankApps: e.target.value }))}
            />
          </label>
          <label className="block text-sm md:col-span-2">
            <span className="text-slate-600">หมายเหตุภายใน</span>
            <textarea
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              rows={2}
              value={form.notes}
              disabled={!canMutate}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
            />
          </label>
        </div>
        {canMutate ? (
          <button
            type="button"
            onClick={() => void saveAccount()}
            className="mt-4 inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-500"
          >
            <Save size={18} />
            บันทึกข้อมูลบัญชี
          </button>
        ) : null}
      </section>

      {/* วิธีใช้งานแต่ละช่องทาง */}
      <section className="grid gap-4 md:grid-cols-2">
        <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-5">
          <h3 className="flex items-center gap-2 font-bold text-emerald-900">
            <ArrowDownLeft size={20} />
            รับเงิน (Inbound)
          </h3>
          <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-emerald-900/90">
            <li>
              <strong>QR / พร้อมเพย์:</strong> แสดง QR หรือเลขพร้อมเพย์ให้ลูกค้า — หลังได้รับเงินให้บันทึกรายการ
              &quot;รับเข้า&quot; พร้อมยอดและอ้างอิง
            </li>
            <li>
              <strong>Mobile banking:</strong> ลูกค้าโอนเข้าเลขบัญชี — ตรวจสลิปแล้วบันทึกเลขอ้างอิงจาก SMS/สลิป
            </li>
          </ul>
        </div>
        <div className="rounded-xl border border-rose-200 bg-rose-50/60 p-5">
          <h3 className="flex items-center gap-2 font-bold text-rose-900">
            <ArrowUpRight size={20} />
            จ่ายออก / โอนออก (Outbound)
          </h3>
          <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-rose-900/90">
            <li>
              <strong>โอนผ่านแอปธนาคาร:</strong> โอนจากบัญชีเดียวกันไปผู้รับ — เก็บสลิปและบันทึกเป็น &quot;จ่ายออก&quot;
            </li>
            <li>
              <strong>QR จ่าย:</strong> หากสแกนจ่ายผู้อื่น ให้บันทึกยอดและผู้รับในช่องอ้างอิง
            </li>
          </ul>
        </div>
      </section>

      {/* เพิ่มรายการ */}
      <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="flex items-center gap-2 text-lg font-bold text-slate-900">
            <BookOpen className="text-indigo-600" size={22} />
            บันทึกรายการรับ / จ่าย
          </h2>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={downloadCsv}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              <Download size={16} />
              Export CSV
            </button>
            {canMutate ? (
              <button
                type="button"
                onClick={() => setAddOpen((v) => !v)}
                className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-3 py-2 text-sm font-semibold text-white hover:bg-slate-800"
              >
                <Plus size={18} />
                {addOpen ? "ปิดฟอร์ม" : "เพิ่มรายการ"}
              </button>
            ) : null}
          </div>
        </div>

        {addOpen && canMutate ? (
          <div className="mt-6 grid gap-4 rounded-xl border border-dashed border-indigo-200 bg-indigo-50/40 p-4 md:grid-cols-2">
            <label className="block text-sm md:col-span-2">
              <span className="text-slate-600">ทิศทาง</span>
              <select
                className="mt-1 w-full max-w-xs rounded-lg border border-slate-200 px-3 py-2"
                value={addDirection}
                onChange={(e) => setAddDirection(e.target.value as ManualSettlementDirection)}
              >
                <option value="INBOUND">รับเงินเข้า (ลูกค้า/ผู้ใช้จ่ายให้เรา)</option>
                <option value="OUTBOUND">จ่ายออก / โอนออก (เราจ่ายให้ผู้อื่น)</option>
              </select>
            </label>
            <label className="block text-sm md:col-span-2">
              <span className="text-slate-600">ช่องทาง</span>
              <select
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2"
                value={addChannel}
                onChange={(e) => setAddChannel(e.target.value as ManualSettlementChannel)}
              >
                {CHANNEL_OPTIONS.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-xs text-slate-500">
                {CHANNEL_OPTIONS.find((x) => x.value === addChannel)?.hint}
              </p>
            </label>
            <label className="block text-sm">
              <span className="text-slate-600">จำนวนเงิน (THB)</span>
              <input
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 font-mono"
                value={addAmount}
                placeholder="1500.00"
                onChange={(e) => setAddAmount(e.target.value)}
              />
            </label>
            <label className="block text-sm">
              <span className="text-slate-600">วันเวลาโอน (จากสลิป — ไม่บังคับ)</span>
              <input
                type="datetime-local"
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2"
                value={addTransferAt}
                onChange={(e) => setAddTransferAt(e.target.value)}
              />
            </label>
            <label className="block text-sm md:col-span-2">
              <span className="text-slate-600">อ้างอิง (เลขงาน / ชื่อผู้โอน / คู่ธุรกรรม)</span>
              <input
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2"
                value={addRef}
                onChange={(e) => setAddRef(e.target.value)}
              />
            </label>
            <label className="block text-sm md:col-span-2">
              <span className="text-slate-600">เลขอ้างอิงธนาคาร / Ref (จากสลิปหรือ SMS) — ใช้กันบันทึกซ้ำ</span>
              <input
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 font-mono text-sm"
                value={addBankRef}
                onChange={(e) => setAddBankRef(e.target.value)}
              />
            </label>
            <label className="block text-sm md:col-span-2">
              <span className="flex items-center gap-2 text-slate-600">
                <Link2 size={16} />
                URL สลิป (หรืออัปโหลดด้านล่าง)
              </span>
              <input
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 font-mono text-xs"
                value={addSlipUrl}
                onChange={(e) => setAddSlipUrl(e.target.value)}
                placeholder="https://..."
              />
            </label>
            <div className="md:col-span-2 flex flex-wrap items-center gap-3">
              <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
                <Upload size={16} />
                {uploadingSlip ? "กำลังอัปโหลด…" : "อัปโหลดสลิป (ไฟล์)"}
                <input type="file" accept="image/*,application/pdf" className="hidden" onChange={onSlipFile} disabled={uploadingSlip} />
              </label>
              {serverSync !== "ok" ? (
                <span className="text-xs text-slate-500">อัปโหลดได้เมื่อ API พร้อม</span>
              ) : null}
            </div>
            <label className="block text-sm md:col-span-2">
              <span className="text-slate-600">หมายเหตุ</span>
              <textarea
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                rows={2}
                value={addNotes}
                onChange={(e) => setAddNotes(e.target.value)}
              />
            </label>
            <div className="md:col-span-2">
              <button
                type="button"
                onClick={() => void submitRecord()}
                className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500"
              >
                บันทึกรายการ
              </button>
            </div>
          </div>
        ) : null}

        <div className="mt-6 overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-xs uppercase text-slate-500">
                <th className="py-2 pr-4">วันที่บันทึก</th>
                <th className="py-2 pr-4">ทิศทาง</th>
                <th className="py-2 pr-4">ช่องทาง</th>
                <th className="py-2 pr-4 text-right">ยอด</th>
                <th className="py-2 pr-4">อ้างอิง</th>
                <th className="py-2 pr-4">Ref ธนาคาร</th>
                <th className="py-2 pr-4">สลิป</th>
                <th className="py-2 pr-4">สถานะ</th>
              </tr>
            </thead>
            <tbody>
              {records.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-slate-500">
                    ยังไม่มีรายการ — กด &quot;เพิ่มรายการ&quot; หลังมีการโอนจริง
                  </td>
                </tr>
              ) : (
                records.map((r) => (
                  <tr key={r.id} className="border-b border-slate-100">
                    <td className="py-2 pr-4 whitespace-nowrap text-slate-600">
                      {new Date(r.createdAt).toLocaleString("th-TH")}
                    </td>
                    <td className="py-2 pr-4">
                      {r.direction === "INBOUND" ? (
                        <span className="rounded bg-emerald-100 px-2 py-0.5 text-emerald-800">รับเข้า</span>
                      ) : (
                        <span className="rounded bg-rose-100 px-2 py-0.5 text-rose-800">จ่ายออก</span>
                      )}
                    </td>
                    <td className="py-2 pr-4 text-slate-700">
                      {CHANNEL_OPTIONS.find((c) => c.value === r.channel)?.label ?? r.channel}
                    </td>
                    <td className="py-2 pr-4 text-right font-mono font-medium">
                      {fmtMoney(r.amount)} ฿
                    </td>
                    <td className="py-2 pr-4 max-w-[200px] truncate text-slate-700" title={r.referenceLabel}>
                      {r.referenceLabel}
                    </td>
                    <td className="py-2 pr-4 text-xs text-slate-600">
                      {r.bankReference ? <span className="font-mono">{r.bankReference}</span> : "—"}
                    </td>
                    <td className="py-2 pr-4">
                      {r.slipUrl ? (
                        <a
                          href={r.slipUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-indigo-600 underline text-xs"
                        >
                          เปิด
                        </a>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="py-2 pr-4">
                      <select
                        className="rounded border border-slate-200 px-2 py-1 text-xs"
                        value={r.status}
                        disabled={!canMutate}
                        onChange={(e) => {
                          const st = e.target.value as ManualSettlementRecord["status"];
                          void onStatusChange(r, st);
                        }}
                      >
                        <option value="PENDING_RECONCILE">รอกระทบยอด</option>
                        <option value="MATCHED">กระทบยอดแล้ว</option>
                        <option value="FLAGGED">ติดธง / ตรวจสอบ</option>
                      </select>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Audit ล่าสุด (เซิร์ฟเวอร์) */}
      {auditRows.length > 0 ? (
        <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="mb-4 flex items-center gap-2 text-lg font-bold text-slate-900">
            <FileText className="text-indigo-600" size={22} />
            Audit ล่าสุด (บัญชีชั่วคราว)
          </h2>
          <p className="mb-3 text-xs text-slate-500">
            ดึงจาก audit_log — ครอบคลุมการแก้บัญชี สร้าง/แก้รายการ และอัปโหลดสลิป (ป้องกันการบันทึกซ้ำด้วยเลข ref ธนาคาร)
          </p>
          <div className="max-h-72 overflow-auto text-xs">
            <table className="min-w-full">
              <thead>
                <tr className="border-b text-slate-500">
                  <th className="py-1 pr-2 text-left">เวลา</th>
                  <th className="py-1 pr-2 text-left">การกระทำ</th>
                  <th className="py-1 pr-2 text-left">Entity</th>
                </tr>
              </thead>
              <tbody>
                {auditRows.map((log) => (
                  <tr key={String(log.id)} className="border-b border-slate-100">
                    <td className="py-1.5 pr-2 whitespace-nowrap text-slate-600">
                      {log.created_at ? new Date(log.created_at).toLocaleString("th-TH") : "—"}
                    </td>
                    <td className="py-1.5 pr-2 font-mono text-slate-800">{log.action}</td>
                    <td className="py-1.5 pr-2 text-slate-600">
                      {(log.entity_name || log.entity_type || "") + (log.entity_id ? ` / ${log.entity_id}` : "")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      <div className="flex items-start gap-2 rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
        <Shield className="mt-0.5 h-5 w-5 shrink-0 text-slate-500" />
        <p>
          เมื่อ Gateway อนุมัติ: ตั้งค่าใน{" "}
          <strong>Payment Gateway</strong> / <strong>AQOND Gateway Console</strong> แล้วลดการใช้บัญชีส่วนตัว
          ตามนโยบายบริษัท — รายการและ audit ใช้สำหรับตรวจสอบช่วงเปลี่ยนผ่าน
        </p>
      </div>
    </div>
  );
};
