import React, { useEffect, useState } from "react";
import { RefreshCw, CreditCard, Landmark, TrendingDown, RotateCcw } from "lucide-react";
import {
  getPaymentProviderGate,
  patchPaymentProviderGate,
  type PatchPaymentProviderGateBody,
} from "../services/adminApi";

export const PaymentProviderGateView: React.FC = () => {
  const [data, setData] = useState<Record<string, unknown> | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [patchErr, setPatchErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [markupDraft, setMarkupDraft] = useState("");

  const load = () => {
    setLoading(true);
    setErr(null);
    getPaymentProviderGate()
      .then((d) => setData(d as Record<string, unknown>))
      .catch((e: Error) => setErr(e.message || "โหลดไม่สำเร็จ"))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    if (data?.matchMarkupPercent != null && data.matchMarkupPercent !== "") {
      setMarkupDraft(String(data.matchMarkupPercent));
    }
  }, [data?.matchMarkupPercent]);

  const applyPatch = async (body: PatchPaymentProviderGateBody) => {
    setSaving(true);
    setPatchErr(null);
    try {
      const d = await patchPaymentProviderGate(body);
      setData(d as Record<string, unknown>);
    } catch (e) {
      setPatchErr((e as Error).message || "อัปเดตไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <Landmark className="text-indigo-600" size={28} />
            Payment Provider Gate
          </h1>
          <p className="text-slate-600 mt-1 text-sm">
            สลับ Payso / Ksher และ Match markup ได้ทันทีจากหน้านี้ (PATCH) — ค่าเริ่มต้นยังมาจาก ENV บนเซิร์ฟเวอร์
          </p>
        </div>
        <button
          type="button"
          onClick={load}
          disabled={loading || saving}
          className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-500 disabled:opacity-50"
        >
          <RefreshCw size={18} className={loading ? "animate-spin" : ""} />
          รีเฟรช
        </button>
      </div>

      {err ? (
        <div className="rounded-lg border border-red-200 bg-red-50 text-red-800 px-4 py-3 text-sm">{err}</div>
      ) : null}
      {patchErr ? (
        <div className="rounded-lg border border-red-200 bg-red-50 text-red-800 px-4 py-3 text-sm">{patchErr}</div>
      ) : null}

      {loading && !data ? (
        <p className="text-slate-500">กำลังโหลด…</p>
      ) : data ? (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm space-y-3">
              <div>
                <p className="text-xs font-semibold text-slate-500 uppercase">Local QR / Wallet</p>
                <p className="text-lg font-bold text-slate-900 mt-1">{String(data.localGatewayLabel ?? "")}</p>
                <p className="text-sm text-slate-600 mt-1">key: {String(data.localGateway ?? "")}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={saving || String(data.localGateway ?? "").toLowerCase() === "ksher"}
                  onClick={() => applyPatch({ localGateway: "ksher" })}
                  className="px-3 py-1.5 text-sm font-medium rounded-lg bg-emerald-600 text-white hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Activate Ksher
                </button>
                <button
                  type="button"
                  disabled={saving || String(data.localGateway ?? "").toLowerCase() === "payso"}
                  onClick={() => applyPatch({ localGateway: "payso" })}
                  className="px-3 py-1.5 text-sm font-medium rounded-lg border border-slate-300 text-slate-800 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Activate Payso
                </button>
              </div>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm flex items-center gap-3">
              <CreditCard className="text-violet-600 shrink-0" size={32} />
              <div>
                <p className="text-xs font-semibold text-slate-500 uppercase">Stripe (บัตร)</p>
                <p className="text-lg font-bold text-slate-900">
                  {data.stripeCardEnabled ? "เปิดใช้" : "ปิด"}
                </p>
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-xs font-semibold text-slate-500 uppercase">PaySo QR เติมเงิน (วอลเล็ต)</p>
                <p className="text-sm text-slate-700 mt-1">
                  เปิด/ปิด QR บนหน้าเติมเงินในแอป — ปิดแล้วผู้ใช้ยังโอนธนาคารพร้อมแนบสลิปได้
                </p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={Boolean(data.paysoEnvEnabled) && !Boolean(data.paysoQrDepositBlockedByAdmin)}
                disabled={
                  saving ||
                  !Boolean(data.paysoEnvEnabled)
                }
                onClick={() => {
                  if (!Boolean(data.paysoEnvEnabled) || saving) return;
                  const blocked = Boolean(data.paysoQrDepositBlockedByAdmin);
                  void applyPatch({ paysoQrDepositBlocked: !blocked });
                }}
                className={`relative inline-flex h-8 w-14 shrink-0 items-center rounded-full border-2 border-transparent transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 disabled:cursor-not-allowed disabled:opacity-50 ${
                  Boolean(data.paysoEnvEnabled) && !Boolean(data.paysoQrDepositBlockedByAdmin)
                    ? "bg-emerald-500"
                    : "bg-slate-300"
                }`}
              >
                <span className="sr-only">สลับการใช้งาน PaySo QR เติมเงิน</span>
                <span
                  className={`inline-block h-6 w-6 transform rounded-full bg-white shadow transition ${
                    Boolean(data.paysoEnvEnabled) && !Boolean(data.paysoQrDepositBlockedByAdmin)
                      ? "translate-x-7"
                      : "translate-x-1"
                  }`}
                />
              </button>
            </div>
            {!Boolean(data.paysoEnvEnabled) ? (
              <div className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 space-y-2">
                <p>
                  ต้องเปิด PaySo ใน <strong>โปรเซส Node ของ API ที่แท็บนี้เรียกอยู่จริง</strong> (เช่น <code className="font-mono">https://api.aqond.com</code>) — ไฟล์{" "}
                  <code className="font-mono">backend/.env</code> บนเครื่อง dev ไม่ส่งไป production ให้อัตโนมัติ
                </p>
                <p>
                  ตั้ง <code className="font-mono">PAYSO_ENABLED</code> เป็น{" "}
                  <code className="font-mono">1</code>, <code className="font-mono">true</code>, <code className="font-mono">yes</code> หรือ{" "}
                  <code className="font-mono">on</code> บนโฮสต์ (Docker / Render / PM2 Environment) พร้อมคีย์{" "}
                  <code className="font-mono">PAYSO_*</code> แล้วรีสตาร์ท API
                </p>
                {data.paysoEnvDiagnostics && typeof data.paysoEnvDiagnostics === "object" ? (
                  <p className="font-mono text-[11px] text-amber-900/95 break-all leading-relaxed">
                    อ่านจากเซิร์ฟเวอร์นี้:{" "}
                    <span className="whitespace-nowrap">
                      PAYSO_DEFINED=
                      {(data.paysoEnvDiagnostics as { defined?: boolean }).defined ? "yes" : "no"}
                    </span>{" "}
                    · RAW=
                    {(data.paysoEnvDiagnostics as { raw?: string | null }).raw == null ||
                    String((data.paysoEnvDiagnostics as { raw?: string | null }).raw) === ""
                      ? "(ไม่มีในตัวแปรของ process หรือเป็นค่าว่าง)"
                      : JSON.stringify(String((data.paysoEnvDiagnostics as { raw?: string | null }).raw))}
                  </p>
                ) : null}
              </div>
            ) : (
              <p className="text-xs text-slate-500">
                ฝั่งแอปมือถือ:{" "}
                <strong className="text-slate-800">
                  {Boolean(data.paysoQrWalletTopupEnabled) ? "เติม QR PaySo ได้" : "ปิด QR"} · แอดมิน:{" "}
                  {Boolean(data.paysoQrDepositBlockedByAdmin) ? "ปิด" : "เปิด"}
                </strong>
              </p>
            )}
          </div>

          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-3">
            <p className="text-sm font-semibold text-slate-800">Match markup (ผู้จ้างจ่ายบนงาน)</p>
            <p className="text-2xl font-mono text-indigo-700">{String(data.matchMarkupPercent ?? "")}%</p>
            <div className="flex flex-wrap items-end gap-2">
              <label className="flex flex-col gap-1 text-xs text-slate-600">
                แก้ไข (%)
                <input
                  type="number"
                  min={0}
                  max={50}
                  step={0.01}
                  value={markupDraft}
                  onChange={(e) => setMarkupDraft(e.target.value)}
                  className="w-28 px-2 py-1.5 rounded border border-slate-300 text-sm font-mono text-slate-900"
                />
              </label>
              <button
                type="button"
                disabled={saving}
                onClick={() => {
                  const n = Number(markupDraft);
                  if (!Number.isFinite(n) || n < 0 || n > 50) {
                    setPatchErr("Match markup ต้องอยู่ระหว่าง 0–50");
                    return;
                  }
                  void applyPatch({ matchMarkupPercent: n });
                }}
                className="px-3 py-1.5 text-sm font-medium rounded-lg bg-indigo-600 text-white hover:bg-indigo-500 disabled:opacity-50"
              >
                บันทึก markup
              </button>
              <button
                type="button"
                disabled={saving}
                title="ล้าง override กลับไปใช้ค่า ENV"
                onClick={() => {
                  if (!confirm("ล้างการตั้งค่า runtime (gateway + markup) กลับไปตาม ENV?")) return;
                  void applyPatch({ reset: true });
                }}
                className="inline-flex items-center gap-1 px-3 py-1.5 text-sm font-medium rounded-lg border border-amber-300 text-amber-900 bg-amber-50 hover:bg-amber-100 disabled:opacity-50"
              >
                <RotateCcw size={16} />
                รีเซ็ตเป็น ENV
              </button>
            </div>
          </div>

          {data.bestProviderHints && typeof data.bestProviderHints === "object" ? (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50/80 p-4 shadow-sm">
              <p className="text-sm font-semibold text-emerald-900 flex items-center gap-2 mb-3">
                <TrendingDown className="shrink-0" size={20} />
                Best provider hints (MDR ต่ำสุดต่อช่อง — จาก getPaymentProviderGateSnapshot)
              </p>
              <p className="text-xs text-emerald-800 mb-3">
                เปรียบเทียบ Payso vs Ksher ต่อช่อง — ค่ามาจาก response ของ API (MDR จาก ENV บนเซิร์ฟเวอร์ อัปเดตเมื่อรีเฟรช)
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {Object.entries(data.bestProviderHints as Record<string, unknown>)
                  .filter(([, hint]) => hint != null && typeof hint === "object")
                  .map(([key, hint]) => {
                  const h = hint as Record<string, unknown>;
                  const gw = String(h.gateway ?? "");
                  const mdr = h.mdrDecimal != null ? Number(h.mdrDecimal) : NaN;
                  const pct = Number.isFinite(mdr) ? (mdr * 100).toFixed(2) : "—";
                  const kind = String(h.kind ?? "");
                  return (
                    <div
                      key={key}
                      className="rounded-lg border border-emerald-200 bg-white p-3 text-sm shadow-sm"
                    >
                      <p className="font-semibold text-slate-800 capitalize">{key}</p>
                      <p className="text-lg font-bold text-emerald-700 mt-1">
                        {gw || "—"}
                        <span className="text-xs font-normal text-slate-500 ml-1">({kind})</span>
                      </p>
                      <p className="text-xs text-slate-600 mt-1">MDR ~{pct}%</p>
                      {Array.isArray(h.compared) && h.compared.length > 0 ? (
                        <ul className="mt-2 text-[11px] text-slate-500 space-y-0.5 font-mono">
                          {(h.compared as { gateway?: string; mdrDecimal?: number }[]).map((c, i) => (
                            <li key={i}>
                              {String(c.gateway ?? "")}:{" "}
                              {c.mdrDecimal != null ? `${(Number(c.mdrDecimal) * 100).toFixed(2)}%` : "—"}
                            </li>
                          ))}
                        </ul>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </div>
          ) : null}

          <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
            <p className="px-4 py-2 bg-slate-100 text-sm font-semibold text-slate-800">
              สรุปค่าธรรมเนียม (effective + อ้างอิง Payso / Ksher / Stripe)
            </p>
            <pre className="p-4 text-xs overflow-x-auto text-slate-700 max-h-[480px] overflow-y-auto">
              {JSON.stringify(
                {
                  localGateway: data.localGateway,
                  matchMarkupPercent: data.matchMarkupPercent,
                  runtime: data.runtime,
                  mdr: data.mdr,
                  stripeDetail: data.stripeDetail,
                  referenceRates: data.referenceRates,
                  bestProviderHints: data.bestProviderHints,
                },
                null,
                2,
              )}
            </pre>
          </div>

          {data.envHint ? (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
              <strong>ENV:</strong> {String(data.envHint)}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
};
