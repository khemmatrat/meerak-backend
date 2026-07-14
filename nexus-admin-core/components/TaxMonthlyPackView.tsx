import React, { useEffect, useMemo, useState } from "react";
import { Download, FileSpreadsheet, RefreshCw, ShieldCheck } from "lucide-react";
import {
  ADMIN_API_BASE,
  getAdminToken,
  getTaxMonthlyPack,
  type TaxMonthlyPack,
} from "../services/adminApi";

const reportLabels: Record<string, string> = {
  "vat-sales": "VAT Sales",
  wht: "WHT",
  "platform-revenue": "Platform Revenue",
  "provider-income": "Provider Income",
  "wallet-flows": "Deposits / Withdrawals",
};

function money(value: unknown): string {
  return Number(value || 0).toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function shortHash(value: string | undefined): string {
  return value ? `${value.slice(0, 12)}...${value.slice(-8)}` : "-";
}

async function downloadCsv(path: string, filename: string) {
  const token = getAdminToken();
  const res = await fetch(`${ADMIN_API_BASE}${path}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) throw new Error(await res.text());
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export const TaxMonthlyPackView: React.FC = () => {
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [pack, setPack] = useState<TaxMonthlyPack | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState<string | null>(null);

  const reconciliationEntries = useMemo(() => {
    const rec = pack?.meta?.reconciliation || {};
    return Object.entries(rec).filter(([key]) => key !== "checksum_sha256");
  }, [pack]);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      setPack(await getTaxMonthlyPack(month, year));
    } catch (e) {
      setError(e instanceof Error ? e.message : "โหลด Monthly Tax Pack ไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function handleDownload(name: string, filename: string) {
    setDownloading(name);
    setError(null);
    try {
      await downloadCsv(
        `/api/admin/tax/export/${name}?month=${encodeURIComponent(String(month))}&year=${encodeURIComponent(String(year))}&format=csv`,
        filename,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "ดาวน์โหลด CSV ไม่สำเร็จ");
    } finally {
      setDownloading(null);
    }
  }

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-slate-900">
            <FileSpreadsheet className="h-6 w-6 text-indigo-600" />
            Monthly Tax Pack
          </h1>
          <p className="text-sm text-slate-500">
            Evidence pack สำหรับ VAT, WHT, platform revenue, provider income, deposits/withdrawals พร้อม checksum สำหรับ audit trail
          </p>
        </div>
        <button
          type="button"
          onClick={load}
          disabled={loading}
          className="inline-flex items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700 disabled:opacity-60"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          Generate Pack
        </button>
      </div>

      <div className="grid grid-cols-1 gap-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm md:grid-cols-3">
        <label className="space-y-1 text-sm">
          <span className="font-medium text-slate-700">Month</span>
          <select value={month} onChange={(e) => setMonth(Number(e.target.value))} className="w-full rounded-lg border border-slate-300 px-3 py-2">
            {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
        </label>
        <label className="space-y-1 text-sm">
          <span className="font-medium text-slate-700">Year</span>
          <input value={year} onChange={(e) => setYear(Number(e.target.value))} className="w-full rounded-lg border border-slate-300 px-3 py-2" type="number" min={2000} max={2100} />
        </label>
        <div className="rounded-lg bg-slate-50 p-3 text-xs text-slate-600">
          <div className="font-semibold text-slate-800">Pack checksum</div>
          <div className="mt-1 font-mono">{shortHash(pack?.meta?.checksum_sha256)}</div>
          <div className="mt-1">Generated: {pack?.meta?.generated_at ? new Date(pack.meta.generated_at).toLocaleString("th-TH") : "-"}</div>
        </div>
      </div>

      {error && <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}

      <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 p-4">
          <h2 className="font-semibold text-slate-900">CSV Evidence Files</h2>
          <p className="text-sm text-slate-500">CSV ใช้ stable headers และ UTF-8 BOM เพื่อเปิดใน Excel/Thai locale ได้ง่าย</p>
        </div>
        <div className="divide-y divide-slate-100">
          {(pack?.meta?.files || []).map((file) => (
            <div key={file.name} className="flex flex-col gap-3 p-4 md:flex-row md:items-center md:justify-between">
              <div>
                <div className="font-medium text-slate-900">{reportLabels[file.name] || file.name}</div>
                <div className="text-xs text-slate-500">Rows: {file.row_count} · SHA256: <span className="font-mono">{shortHash(file.checksum_sha256)}</span></div>
              </div>
              <button
                type="button"
                onClick={() => handleDownload(file.name, file.filename)}
                disabled={downloading === file.name}
                className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
              >
                <Download className="h-4 w-4" />
                {downloading === file.name ? "Downloading..." : "Download CSV"}
              </button>
            </div>
          ))}
          {!pack?.meta?.files?.length && <div className="p-6 text-center text-sm text-slate-500">กด Generate Pack เพื่อโหลดรายการ</div>}
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center gap-2 border-b border-slate-100 p-4">
          <ShieldCheck className="h-5 w-5 text-emerald-600" />
          <h2 className="font-semibold text-slate-900">Reconciliation Panels</h2>
        </div>
        <div className="grid grid-cols-1 gap-4 p-4 md:grid-cols-2">
          {reconciliationEntries.map(([key, value]) => (
            <div key={key} className="rounded-lg border border-slate-200 p-4">
              <div className="mb-3 text-sm font-semibold text-slate-900">{key.replace(/_/g, " ")}</div>
              <div className="space-y-1 text-xs text-slate-600">
                {Object.entries((value || {}) as Record<string, unknown>).map(([k, v]) => (
                  <div key={k} className="flex justify-between gap-3">
                    <span>{k.replace(/_/g, " ")}</span>
                    <span className="font-mono">{typeof v === "number" ? money(v) : String(v)}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
          {!reconciliationEntries.length && <div className="text-sm text-slate-500">ยังไม่มีข้อมูล reconciliation</div>}
        </div>
      </div>
    </div>
  );
};
