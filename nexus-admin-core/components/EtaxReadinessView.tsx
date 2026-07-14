import React, { useEffect, useMemo, useState } from "react";
import {
  CheckCircle2,
  Download,
  FileCheck2,
  RefreshCw,
  XCircle,
} from "lucide-react";
import {
  dryRunEtaxDocument,
  getEtaxPayload,
  getEtaxReadiness,
  type EtaxDryRunResponse,
  type EtaxReadinessDocument,
} from "../services/adminApi";

const money = (value: unknown) =>
  Number(value || 0).toLocaleString("th-TH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

const statusCopy: Record<string, string> = {
  not_ready: "ยังไม่ตรวจ",
  ready: "พร้อม",
  dry_run_valid: "Dry-run ผ่าน",
  validation_failed: "ข้อมูลไม่ครบ",
  submit_disabled: "ปิดการส่งจริง",
  submitted: "ส่งแล้ว",
  accepted: "Provider รับแล้ว",
  rejected: "Provider ปฏิเสธ",
  error: "ผิดพลาด",
};

function downloadJson(filename: string, data: unknown) {
  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: "application/json;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export const EtaxReadinessView: React.FC = () => {
  const [documents, setDocuments] = useState<EtaxReadinessDocument[]>([]);
  const [summary, setSummary] = useState<
    Array<{ etax_status: string; count: number }>
  >([]);
  const [status, setStatus] = useState("");
  const [provider, setProvider] = useState("provider_neutral_dry_run");
  const [loading, setLoading] = useState(false);
  const [runningId, setRunningId] = useState<string | null>(null);
  const [selected, setSelected] = useState<EtaxDryRunResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const summaryMap = useMemo(() => {
    return summary.reduce<Record<string, number>>((acc, row) => {
      acc[row.etax_status || "not_ready"] = Number(row.count || 0);
      return acc;
    }, {});
  }, [summary]);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await getEtaxReadiness({
        limit: 100,
        status: status || undefined,
      });
      setDocuments(res.documents || []);
      setSummary(res.summary || []);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "โหลด e-Tax readiness ไม่สำเร็จ",
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [status]);

  async function runDryRun(id: string) {
    setRunningId(id);
    setError(null);
    try {
      const res = await dryRunEtaxDocument(id, provider);
      setSelected(res);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "dry-run ไม่สำเร็จ");
    } finally {
      setRunningId(null);
    }
  }

  async function exportPayload(id: string) {
    setRunningId(id);
    setError(null);
    try {
      const res = await getEtaxPayload(id, provider);
      setSelected(res);
      downloadJson(`etax-payload-${id}.json`, res);
    } catch (e) {
      setError(e instanceof Error ? e.message : "export payload ไม่สำเร็จ");
    } finally {
      setRunningId(null);
    }
  }

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-slate-900">
            <FileCheck2 className="h-6 w-6 text-indigo-600" />
            e-Tax / e-Receipt Readiness
          </h1>
          <p className="text-sm text-slate-500">
            Dry-run only: validate issued fiscal documents and export
            provider-neutral onboarding payloads. Live submit is disabled.
          </p>
          <p className="mt-1 text-sm text-amber-700">
            ก่อนออก Tax Invoice / WHT Certificate ต้องมีชื่อกฎหมาย, Tax ID
            และที่อยู่จดทะเบียนของผู้ซื้อหรือผู้รับเงินครบถ้วน; ถ้าข้อมูลไม่ครบ
            ระบบจะคงเอกสารเป็น draft และแสดง TAX_PROFILE_REQUIRED_FOR_ISSUE.
          </p>
        </div>
        <button
          type="button"
          onClick={load}
          disabled={loading}
          className="inline-flex items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
        {[
          "not_ready",
          "dry_run_valid",
          "validation_failed",
          "submit_disabled",
        ].map((key) => (
          <div
            key={key}
            className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
          >
            <div className="text-xs font-semibold uppercase text-slate-500">
              {statusCopy[key]}
            </div>
            <div className="mt-2 text-2xl font-bold text-slate-900">
              {summaryMap[key] || 0}
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm md:grid-cols-3">
        <label className="space-y-1 text-sm">
          <span className="font-medium text-slate-700">Status</span>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2"
          >
            <option value="">ทั้งหมด</option>
            {Object.entries(statusCopy).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1 text-sm md:col-span-2">
          <span className="font-medium text-slate-700">
            Dry-run Provider Label
          </span>
          <input
            value={provider}
            onChange={(e) => setProvider(e.target.value)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2"
          />
        </label>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50 text-left text-xs font-semibold uppercase text-slate-500">
              <tr>
                <th className="px-4 py-3">Document</th>
                <th className="px-4 py-3">Fiscal Status</th>
                <th className="px-4 py-3 text-right">Totals</th>
                <th className="px-4 py-3">e-Tax Status</th>
                <th className="px-4 py-3">Error</th>
                <th className="px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {documents.map((doc) => (
                <tr key={doc.id} className="align-top">
                  <td className="px-4 py-3">
                    <div className="font-medium text-slate-900">
                      {doc.document_no || doc.id}
                    </div>
                    <div className="text-xs text-slate-500">
                      {doc.document_type} · {doc.party_role}
                    </div>
                  </td>
                  <td className="px-4 py-3">{doc.status}</td>
                  <td className="px-4 py-3 text-right">
                    <div>฿{money(doc.total_amount)}</div>
                    <div className="text-xs text-slate-500">
                      VAT ฿{money(doc.vat_amount)} · WHT ฿
                      {money(doc.wht_amount)}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-1 text-xs font-medium text-slate-700">
                      {doc.etax_status === "dry_run_valid" ? (
                        <CheckCircle2 className="h-3 w-3 text-emerald-600" />
                      ) : doc.etax_status === "validation_failed" ? (
                        <XCircle className="h-3 w-3 text-red-600" />
                      ) : null}
                      {statusCopy[doc.etax_status] || doc.etax_status}
                    </span>
                    {doc.etax_provider && (
                      <div className="mt-1 text-xs text-slate-500">
                        {doc.etax_provider}
                      </div>
                    )}
                  </td>
                  <td className="max-w-xs px-4 py-3 text-xs text-red-700">
                    {doc.etax_error || "-"}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => runDryRun(doc.id)}
                        disabled={runningId === doc.id}
                        className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700 disabled:opacity-60"
                      >
                        Validate
                      </button>
                      <button
                        type="button"
                        onClick={() => exportPayload(doc.id)}
                        disabled={runningId === doc.id}
                        className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                      >
                        <Download className="h-3 w-3" />
                        Payload
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {!documents.length && !loading && (
                <tr>
                  <td
                    className="px-4 py-8 text-center text-slate-500"
                    colSpan={6}
                  >
                    ยังไม่มีเอกสารตามตัวกรองนี้
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {selected && (
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="font-semibold text-slate-900">
            Latest Dry-run Result
          </h2>
          <div className="mt-2 text-sm text-slate-600">
            Result: <strong>{selected.ok ? "valid" : "invalid"}</strong> ·
            Errors: {selected.validation.errors.length} · Warnings:{" "}
            {selected.validation.warnings.length}
          </div>
          <pre className="mt-3 max-h-80 overflow-auto rounded-lg bg-slate-950 p-3 text-xs text-slate-100">
            {JSON.stringify(selected.validation, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
};
