import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ClipboardList,
  FileText,
  Scale,
  Upload,
  Trash2,
  AlertTriangle,
  Landmark,
} from "lucide-react";
import {
  WELFARE_POLICY_META,
  WELFARE_POLICY_SECTIONS,
  EXPENSE_REASON_TAGS,
  EXPENSE_CATEGORIES,
} from "../constants/welfarePolicyDraft";

const STORAGE_KEY = "aqond_admin_expense_claims_v1";

export type ExpenseClaimRow = {
  id: string;
  createdAt: string;
  amountThb: number;
  expenseDate: string;
  category: string;
  reasonTag: string;
  note: string;
  receiptFileName: string | null;
  receiptSizeBytes: number | null;
};

function loadClaims(): ExpenseClaimRow[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const p = JSON.parse(raw);
    return Array.isArray(p) ? p : [];
  } catch {
    return [];
  }
}

function saveClaims(rows: ExpenseClaimRow[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(rows));
}

type Tab = "policy" | "claims" | "reporting";

export const DirectorWelfareHubView: React.FC = () => {
  const [tab, setTab] = useState<Tab>("policy");
  const [rows, setRows] = useState<ExpenseClaimRow[]>(() => loadClaims());

  const [amount, setAmount] = useState("");
  const [expenseDate, setExpenseDate] = useState(() =>
    new Date().toISOString().slice(0, 10)
  );
  const [category, setCategory] = useState<string>(EXPENSE_CATEGORIES[0].value);
  const [reasonTag, setReasonTag] = useState<string>(EXPENSE_REASON_TAGS[0].value);
  const [note, setNote] = useState("");
  const [receipt, setReceipt] = useState<File | null>(null);

  useEffect(() => {
    saveClaims(rows);
  }, [rows]);

  const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    setReceipt(f || null);
  };

  const submitClaim = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      const n = parseFloat(amount.replace(/,/g, ""));
      if (!Number.isFinite(n) || n <= 0) {
        alert("กรุณากรอกจำนวนเงิน (บาท) ให้ถูกต้อง");
        return;
      }
      const row: ExpenseClaimRow = {
        id: `clm_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
        createdAt: new Date().toISOString(),
        amountThb: Math.round(n * 100) / 100,
        expenseDate,
        category,
        reasonTag,
        note: note.trim(),
        receiptFileName: receipt?.name ?? null,
        receiptSizeBytes: receipt?.size ?? null,
      };
      setRows((prev) => [row, ...prev]);
      setAmount("");
      setNote("");
      setReceipt(null);
      const input = document.getElementById("welfare-receipt") as HTMLInputElement | null;
      if (input) input.value = "";
    },
    [amount, expenseDate, category, reasonTag, note, receipt]
  );

  const removeRow = (id: string) => {
    if (!confirm("ลบรายการนี้?")) return;
    setRows((prev) => prev.filter((r) => r.id !== id));
  };

  const exportJson = () => {
    const blob = new Blob([JSON.stringify(rows, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `expense-claims-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const catLabel = useMemo(() => {
    const m = Object.fromEntries(EXPENSE_CATEGORIES.map((c) => [c.value, c.label]));
    return (v: string) => m[v] || v;
  }, []);

  const reasonLabel = useMemo(() => {
    const m = Object.fromEntries(EXPENSE_REASON_TAGS.map((c) => [c.value, c.label]));
    return (v: string) => m[v] || v;
  }, []);

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-amber-200 bg-amber-50/90 p-4 text-sm text-amber-950">
        <div className="flex gap-2 font-semibold">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
          ข้อควรทราบ (Tax / กฎหมาย)
        </div>
        <p className="mt-2 leading-relaxed">
          {WELFARE_POLICY_META.note} — ระเบียบด้านล่างเป็น<strong>ร่างเบื้องต้น</strong>สำหรับวางโครงภายใน Admin
          ต้องผ่านที่ประชุมบริษัทและที่ปรึกษาด้านภาษีก่อนใช้บังคับจริง
        </p>
      </div>

      <div className="flex flex-wrap gap-2 rounded-xl border border-slate-200 bg-slate-50/80 p-1">
        {(
          [
            ["policy", "ระเบียบสวัสดิการ (ร่าง)", FileText],
            ["claims", "เบิกค่าใช้จ่าย (Expense Claim)", ClipboardList],
            ["reporting", "Settlement Report vs บัญชีบริษัท", Landmark],
          ] as const
        ).map(([id, label, Icon]) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={`flex min-h-[44px] items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold transition-colors ${
              tab === id
                ? "bg-white text-indigo-700 shadow-sm ring-1 ring-slate-200"
                : "text-slate-600 hover:bg-white/80"
            }`}
          >
            <Icon size={18} /> {label}
          </button>
        ))}
      </div>

      {tab === "policy" && (
        <div className="space-y-4">
          <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="mb-4 flex items-start gap-2">
              <Scale className="h-6 w-6 shrink-0 text-indigo-600" />
              <div>
                <h2 className="text-lg font-bold text-slate-900">
                  ระเบียบสวัสดิการพนักงานและกรรมการ (ร่าง)
                </h2>
                <p className="text-sm text-slate-600">
                  นิติบุคคลอ้างอิงในเอกสาร/ใบเสร็จ:{" "}
                  <strong>{WELFARE_POLICY_META.companyLegalNameTh}</strong> (ปรับตามทะเบียนจริง)
                </p>
              </div>
            </div>
            <ul className="space-y-6">
              {WELFARE_POLICY_SECTIONS.map((sec) => (
                <li key={sec.id} className="border-t border-slate-100 pt-4 first:border-t-0 first:pt-0">
                  <h3 className="font-semibold text-slate-800">{sec.title}</h3>
                  <ul className="mt-2 list-disc space-y-1.5 pl-5 text-sm text-slate-600">
                    {sec.bullets.map((b, i) => (
                      <li key={i}>{b}</li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {tab === "claims" && (
        <div className="grid gap-6 lg:grid-cols-2">
          <form
            onSubmit={submitClaim}
            className="space-y-4 rounded-xl border border-slate-200 bg-white p-6 shadow-sm"
          >
            <h2 className="flex items-center gap-2 text-lg font-bold text-slate-900">
              <Upload className="h-5 w-5 text-indigo-600" />
              บันทึกการเบิก (ตัวอย่างในเบราว์เซอร์)
            </h2>
            <p className="text-xs text-slate-500">
              ข้อมูลเก็บในเครื่อง (localStorage) จนกว่าจะเชื่อม API / ที่เก็บไฟล์จริง — ไม่ส่งไฟล์ใบเสร็จไปเซิร์ฟเวอร์
            </p>

            <div>
              <label className="text-xs font-medium text-slate-500">วันที่ใช้จ่าย</label>
              <input
                type="date"
                value={expenseDate}
                onChange={(e) => setExpenseDate(e.target.value)}
                className="mt-1 w-full min-h-[44px] rounded-lg border border-slate-200 px-3 text-sm"
                required
              />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-500">จำนวนเงิน (บาท)</label>
              <input
                type="text"
                inputMode="decimal"
                placeholder="เช่น 1500 หรือ 1,500"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="mt-1 w-full min-h-[44px] rounded-lg border border-slate-200 px-3 text-sm"
                required
              />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-500">หมวดค่าใช้จ่าย</label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="mt-1 w-full min-h-[44px] rounded-lg border border-slate-200 bg-white px-3 text-sm"
              >
                {EXPENSE_CATEGORIES.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-slate-500">Reason tagging (เหตุผลเชิงนโยบาย)</label>
              <select
                value={reasonTag}
                onChange={(e) => setReasonTag(e.target.value)}
                className="mt-1 w-full min-h-[44px] rounded-lg border border-slate-200 bg-white px-3 text-sm"
              >
                {EXPENSE_REASON_TAGS.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-slate-500">รายละเอียดเพิ่มเติม</label>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={3}
                placeholder="เช่น สาขา / ทะเบียนรถ / ชื่อคอร์ส / อ้างอิงระเบียบข้อ X"
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-500">แนบใบเสร็จ (ชื่อไฟล์จะถูกบันทึก)</label>
              <input
                id="welfare-receipt"
                type="file"
                accept="image/*,.pdf,application/pdf"
                onChange={onFile}
                className="mt-1 w-full text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-indigo-50 file:px-3 file:py-2 file:text-sm file:font-medium file:text-indigo-700"
              />
              {receipt ? (
                <p className="mt-1 text-xs text-slate-500">
                  {receipt.name} ({(receipt.size / 1024).toFixed(1)} KB)
                </p>
              ) : null}
            </div>
            <button
              type="submit"
              className="w-full min-h-[44px] rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-500"
            >
              บันทึกรายการ
            </button>
          </form>

          <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-lg font-bold text-slate-900">รายการที่บันทึกแล้ว</h2>
              <button
                type="button"
                onClick={exportJson}
                disabled={rows.length === 0}
                className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40"
              >
                ส่งออก JSON
              </button>
            </div>
            {rows.length === 0 ? (
              <p className="text-sm text-slate-500">ยังไม่มีรายการ</p>
            ) : (
              <ul className="max-h-[480px] space-y-3 overflow-y-auto">
                {rows.map((r) => (
                  <li
                    key={r.id}
                    className="rounded-lg border border-slate-100 bg-slate-50/80 p-3 text-sm"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="font-semibold text-slate-900">
                          ฿{r.amountThb.toLocaleString(undefined, { minimumFractionDigits: 2 })}{" "}
                          <span className="font-normal text-slate-500">
                            · {r.expenseDate} · {catLabel(r.category)}
                          </span>
                        </p>
                        <p className="text-xs text-indigo-700">{reasonLabel(r.reasonTag)}</p>
                        {r.note ? <p className="mt-1 text-slate-600">{r.note}</p> : null}
                        {r.receiptFileName ? (
                          <p className="mt-1 text-xs text-slate-500">
                            ใบเสร็จ: {r.receiptFileName}
                            {r.receiptSizeBytes != null
                              ? ` (${(r.receiptSizeBytes / 1024).toFixed(1)} KB)`
                              : ""}
                          </p>
                        ) : (
                          <p className="mt-1 text-xs text-amber-700">ไม่มีไฟล์แนบ</p>
                        )}
                        <p className="mt-1 text-[10px] text-slate-400">
                          บันทึกเมื่อ {new Date(r.createdAt).toLocaleString()}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => removeRow(r.id)}
                        className="shrink-0 rounded p-2 text-rose-600 hover:bg-rose-50"
                        title="ลบ"
                      >
                        <Trash2 size={18} />
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      {tab === "reporting" && (
        <div className="space-y-4 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-bold text-slate-900">Settlement Report (Gateway) แยก &quot;สวัสดิการ&quot; ได้หรือไม่?</h2>
          <div className="space-y-3 text-sm leading-relaxed text-slate-700">
            <p>
              <strong>รายงาน Settlement ใน AQOND Gateway Console</strong> (ตาราง{" "}
              <code className="rounded bg-slate-100 px-1 text-xs">gateway_settlement_reports</code>)
              เป็น<strong>สรุปยอดธุรกรรมชำระเงินผ่าน Internal Gateway</strong> ตามช่วงเวลา (ปริมาณ, ค่าธรรมเนียม, จำนวนรายการ, hash)
              เพื่อการกำกับ/ยื่นรายงานตามที่ออกแบบไว้ —{" "}
              <strong>ไม่ได้แบ่งหมวดเป็นสวัสดิการกรรมการ vs ค่าใช้จ่ายดำเนินงานทั่วไป</strong> โดยอัตโนมัติ
            </p>
            <p>
              การแยก<strong>สวัสดิการ / ค่าใช้จ่ายในการจ้างแรงงาน / ค่าใช้จ่ายในการดำเนินงาน</strong>ตามมาตรฐานบัญชีและภาษี
              ควรทำที่<strong>บัญชีบริษัท</strong> (สมุดรายวัน, โปรแกรมบัญชี, หรือระบบ ERP) โดยอิงใบเสร็จและหมวดที่บันทึก
            </p>
            <p>
              ใน Admin หน้านี้ คุณสามารถใช้<strong> Reason tagging + หมวดค่าใช้จ่าย</strong> ในแท็บ &quot;เบิกค่าใช้จ่าย&quot; เพื่อเตรียมข้อมูลส่งต่อบัญชี
              หรือส่งออก JSON — หากต้องการรวมในรายงาน Gateway ในอนาคต ต้องออกแบบฟิลด์เพิ่ม (เช่น ใน{" "}
              <code className="rounded bg-slate-100 px-1 text-xs">regulatory_metadata</code>) หรือตารางค่าใช้จ่ายแยก
              ซึ่งเป็นงาน backend/บัญชี ไม่ใช่แค่หน้าจอเดียว
            </p>
          </div>
        </div>
      )}
    </div>
  );
};
