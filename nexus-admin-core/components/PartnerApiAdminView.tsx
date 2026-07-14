import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Key,
  Plus,
  RefreshCw,
  Loader2,
  Copy,
  Check,
  Shield,
  Activity,
  AlertTriangle,
  Gauge,
  Hash,
  TrendingUp,
  Mail,
} from "lucide-react";
import {
  getPartnerApiKeys,
  createPartnerApiKey,
  patchPartnerApiKey,
  getPartnerApiAudit,
  getPartnerApiDashboard,
  runPartnerApiWeeklyReport,
  type PartnerApiKeyRow,
  type PartnerApiAuditRow,
  type PartnerApiDashboard,
} from "../services/adminApi";

function StatCard({
  label,
  value,
  sub,
  tone = "slate",
}: {
  label: string;
  value: string | number;
  sub?: string;
  tone?: "slate" | "emerald" | "red" | "amber" | "indigo";
}) {
  const tones = {
    slate: "border-slate-200 bg-white text-slate-900",
    emerald: "border-emerald-200 bg-emerald-50 text-emerald-900",
    red: "border-red-200 bg-red-50 text-red-900",
    amber: "border-amber-200 bg-amber-50 text-amber-900",
    indigo: "border-indigo-200 bg-indigo-50 text-indigo-900",
  };
  return (
    <div className={`rounded-xl border p-4 shadow-sm ${tones[tone]}`}>
      <p className="text-xs font-semibold uppercase tracking-wide opacity-70">
        {label}
      </p>
      <p className="text-2xl font-bold mt-1">{value}</p>
      {sub ? <p className="text-xs mt-1 opacity-80">{sub}</p> : null}
    </div>
  );
}

export const PartnerApiAdminView: React.FC = () => {
  const [keys, setKeys] = useState<PartnerApiKeyRow[]>([]);
  const [dashboard, setDashboard] = useState<PartnerApiDashboard | null>(null);
  const [audit, setAudit] = useState<PartnerApiAuditRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [windowHours, setWindowHours] = useState(24);
  const [auditFilter, setAuditFilter] = useState<"all" | "errors">("all");
  const [selectedKeyId, setSelectedKeyId] = useState<string>("");
  const [newName, setNewName] = useState("");
  const [newRate, setNewRate] = useState(60);
  const [newWeeklyQuota, setNewWeeklyQuota] = useState(0);
  const [creating, setCreating] = useState(false);
  const [revealedKey, setRevealedKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [weeklySending, setWeeklySending] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [kRes, dashRes, aRes] = await Promise.all([
        getPartnerApiKeys(),
        getPartnerApiDashboard({ hours: windowHours }),
        getPartnerApiAudit({
          limit: 60,
          api_key_id: selectedKeyId || undefined,
        }),
      ]);
      setKeys(kRes.keys || []);
      setDashboard(dashRes);
      setAudit(aRes.audit || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "โหลดไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }, [windowHours, selectedKeyId]);

  useEffect(() => {
    load();
  }, [load]);

  const filteredAudit = useMemo(() => {
    if (auditFilter === "errors") {
      return audit.filter((a) => (a.status_code || 0) >= 400);
    }
    return audit;
  }, [audit, auditFilter]);

  const maxHourly = useMemo(() => {
    const vals = dashboard?.hourly?.map((h) => h.requests) || [1];
    return Math.max(1, ...vals);
  }, [dashboard?.hourly]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    setError(null);
    try {
      const res = await createPartnerApiKey({
        name: newName.trim() || "Partner",
        rate_limit_per_minute: newRate,
        weekly_quota_requests: newWeeklyQuota,
        scopes: ["trust:read"],
      });
      setRevealedKey(res.api_key);
      setNewName("");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "สร้าง key ไม่สำเร็จ");
    } finally {
      setCreating(false);
    }
  }

  async function toggleKey(id: string, isActive: boolean) {
    try {
      await patchPartnerApiKey(id, { is_active: !isActive });
      await load();
    } catch (e) {
      alert(e instanceof Error ? e.message : "อัปเดตไม่สำเร็จ");
    }
  }

  async function copyKey() {
    if (!revealedKey) return;
    await navigator.clipboard.writeText(revealedKey);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const summary = dashboard?.summary;
  const hashStats = dashboard?.partner_hash;

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-slate-900">
            <Key className="h-6 w-6 text-indigo-600" />
            Partner API Dashboard
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Usage, rate limits, errors — lookup ผ่าน{" "}
            <code className="text-xs bg-slate-100 px-1 rounded">
              users.partner_hash
            </code>
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={windowHours}
            onChange={(e) => setWindowHours(Number(e.target.value) || 24)}
            className="border rounded-lg px-3 py-2 text-sm"
          >
            <option value={1}>1 ชม.</option>
            <option value={6}>6 ชม.</option>
            <option value={24}>24 ชม.</option>
            <option value={168}>7 วัน</option>
          </select>
          <button
            type="button"
            onClick={load}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-lg bg-slate-100 px-4 py-2 text-sm font-medium hover:bg-slate-200 disabled:opacity-60"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            รีเฟรช
          </button>
          <button
            type="button"
            disabled={weeklySending}
            onClick={async () => {
              if (!window.confirm("ส่ง Weekly Trust Report ไป Slack/Email?"))
                return;
              setWeeklySending(true);
              try {
                let r = await runPartnerApiWeeklyReport({ force: false });
                if (!r.sent && r.reason === "deduped") {
                  if (
                    !window.confirm(
                      "ส่งสัปดาห์นี้แล้ว — ต้องการส่งซ้ำ (force)?",
                    )
                  )
                    return;
                  r = await runPartnerApiWeeklyReport({ force: true });
                }
                if (r.sent) {
                  alert(
                    `ส่งแล้ว (Slack: ${r.slack_sent ? "yes" : "no"}, Email: ${r.email_sent ? "yes" : "no"})`,
                  );
                } else {
                  alert(r.reason || "ยังไม่ส่ง — ตรวจ webhook/email env");
                }
              } catch (e) {
                alert(e instanceof Error ? e.message : "ส่งไม่สำเร็จ");
              } finally {
                setWeeklySending(false);
              }
            }}
            className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 text-white px-4 py-2 text-sm font-medium hover:bg-indigo-700 disabled:opacity-60"
          >
            <Mail
              className={`h-4 w-4 ${weeklySending ? "animate-pulse" : ""}`}
            />
            {weeklySending ? "กำลังส่ง…" : "Weekly report"}
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
        </div>
      )}

      {summary &&
        (summary.error_rate_pct >= 15 || summary.rate_limit_count >= 3) && (
          <div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950 flex items-start gap-2">
            <AlertTriangle className="h-5 w-5 shrink-0 text-amber-600" />
            <div>
              <p className="font-semibold">Partner API alert threshold</p>
              <p className="text-xs mt-0.5 opacity-90">
                Error rate {summary.error_rate_pct}% หรือ 429 ={" "}
                {summary.rate_limit_count} — backend จะส่ง Slack ถ้าตั้ง{" "}
                <code className="bg-white/80 px-1 rounded text-[10px]">
                  PARTNER_API_SLACK_WEBHOOK_URL
                </code>{" "}
                (dedupe ต่อชั่วโมง)
              </p>
            </div>
          </div>
        )}

      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
          <StatCard
            label={`Requests (${windowHours}h)`}
            value={summary.total_requests.toLocaleString()}
            sub={`${summary.active_keys}/${summary.total_keys} keys active`}
            tone="indigo"
          />
          <StatCard
            label="Success"
            value={summary.success_count.toLocaleString()}
            tone="emerald"
          />
          <StatCard
            label="Errors"
            value={summary.error_count.toLocaleString()}
            sub={`${summary.error_rate_pct}% error rate`}
            tone={summary.error_count > 0 ? "red" : "slate"}
          />
          <StatCard
            label="Rate limited (429)"
            value={summary.rate_limit_count.toLocaleString()}
            tone={summary.rate_limit_count > 0 ? "amber" : "slate"}
          />
          <StatCard
            label="5xx"
            value={summary.server_error_count.toLocaleString()}
            tone={summary.server_error_count > 0 ? "red" : "slate"}
          />
          <StatCard
            label="Partner hash"
            value={hashStats?.hashed_users?.toLocaleString() ?? "—"}
            sub={`${hashStats?.consent_users ?? 0} consent · ${hashStats?.pending_backfill ?? 0} pending backfill`}
            tone="slate"
          />
        </div>
      )}

      {dashboard?.hourly && dashboard.hourly.length > 0 && (
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-sm font-semibold text-slate-800 flex items-center gap-2 mb-3">
            <TrendingUp size={16} className="text-indigo-600" />
            Traffic by hour ({windowHours}h)
          </p>
          <div className="flex items-end gap-1 h-24 overflow-x-auto pb-1">
            {dashboard.hourly.map((h) => {
              const pct = Math.max(4, (h.requests / maxHourly) * 100);
              const errPct = h.requests > 0 ? (h.errors / h.requests) * 100 : 0;
              return (
                <div
                  key={String(h.hour)}
                  className="flex flex-col items-center min-w-[28px] flex-1"
                  title={`${new Date(h.hour).toLocaleString()} — ${h.requests} req, ${h.errors} err`}
                >
                  <div
                    className="w-full max-w-[32px] rounded-t bg-indigo-200 relative overflow-hidden"
                    style={{ height: `${pct}%` }}
                  >
                    {h.errors > 0 && (
                      <div
                        className="absolute bottom-0 left-0 right-0 bg-red-500/80"
                        style={{ height: `${Math.min(100, errPct)}%` }}
                      />
                    )}
                  </div>
                  <span className="text-[9px] text-slate-400 mt-1 truncate w-full text-center">
                    {new Date(h.hour).getHours()}h
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {revealedKey && (
        <div className="rounded-xl border-2 border-amber-300 bg-amber-50 p-4">
          <p className="text-sm font-bold text-amber-900 mb-2 flex items-center gap-2">
            <Shield size={16} /> คัดลอก API key ตอนนี้ — จะไม่แสดงอีก
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <code className="flex-1 min-w-0 break-all text-xs bg-white border rounded px-2 py-1.5">
              {revealedKey}
            </code>
            <button
              type="button"
              onClick={copyKey}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-amber-600 text-white text-sm font-medium"
            >
              {copied ? <Check size={14} /> : <Copy size={14} />}
              {copied ? "Copied" : "Copy"}
            </button>
            <button
              type="button"
              onClick={() => setRevealedKey(null)}
              className="text-sm text-amber-800 underline"
            >
              ปิด
            </button>
          </div>
        </div>
      )}

      <form
        onSubmit={handleCreate}
        className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm flex flex-wrap gap-3 items-end"
      >
        <div className="flex-1 min-w-[180px]">
          <label className="block text-xs font-semibold text-slate-500 mb-1">
            ชื่อ partner
          </label>
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="เช่น FairDee Trust"
            className="w-full border rounded-lg px-3 py-2 text-sm"
          />
        </div>
        <div className="w-32">
          <label className="block text-xs font-semibold text-slate-500 mb-1">
            Rate/min
          </label>
          <input
            type="number"
            min={10}
            max={600}
            value={newRate}
            onChange={(e) => setNewRate(Number(e.target.value) || 60)}
            className="w-full border rounded-lg px-3 py-2 text-sm"
          />
        </div>
        <div className="w-36">
          <label className="block text-xs font-semibold text-slate-500 mb-1">
            Weekly quota
          </label>
          <input
            type="number"
            min={0}
            value={newWeeklyQuota}
            onChange={(e) => setNewWeeklyQuota(Number(e.target.value) || 0)}
            className="w-full border rounded-lg px-3 py-2 text-sm"
            title="0 = ไม่จำกัดรายสัปดาห์"
          />
        </div>
        <button
          type="submit"
          disabled={creating}
          className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60"
        >
          {creating ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Plus className="h-4 w-4" />
          )}
          สร้าง key
        </button>
      </form>

      <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b bg-slate-50 font-semibold text-sm flex items-center gap-2">
          <Gauge size={16} /> Per-key usage & rate limit
        </div>
        {loading && !dashboard ? (
          <div className="p-8 flex justify-center text-slate-400">
            <Loader2 className="animate-spin" />
          </div>
        ) : (dashboard?.key_stats || []).length === 0 ? (
          <p className="p-6 text-sm text-slate-500">ยังไม่มี key</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-xs text-slate-500 uppercase bg-slate-50">
                <tr>
                  <th className="text-left px-4 py-2">Partner</th>
                  <th className="text-left px-4 py-2">Window req</th>
                  <th className="text-left px-4 py-2">Errors</th>
                  <th className="text-left px-4 py-2">429</th>
                  <th className="text-left px-4 py-2">7d / quota</th>
                  <th className="text-left px-4 py-2 min-w-[140px]">
                    Live rate/min
                  </th>
                  <th className="text-left px-4 py-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {(dashboard?.key_stats || []).map((k) => (
                  <tr
                    key={k.api_key_id}
                    className={`border-t border-slate-100 ${
                      k.near_rate_limit ? "bg-amber-50/60" : ""
                    }`}
                  >
                    <td className="px-4 py-2">
                      <span className="font-medium">{k.name}</span>
                      <span className="block font-mono text-[10px] text-slate-400">
                        {k.key_prefix}…
                      </span>
                    </td>
                    <td className="px-4 py-2">{k.requests_window}</td>
                    <td className="px-4 py-2">
                      <span
                        className={
                          k.errors_window > 0
                            ? "text-red-600 font-semibold"
                            : ""
                        }
                      >
                        {k.errors_window}
                      </span>
                    </td>
                    <td className="px-4 py-2">
                      {k.rate_limits_window > 0 ? (
                        <span className="text-amber-700 font-semibold">
                          {k.rate_limits_window}
                        </span>
                      ) : (
                        "0"
                      )}
                    </td>
                    <td className="px-4 py-2">
                      {k.weekly_quota_requests ? (
                        <button
                          type="button"
                          className={`text-left hover:underline ${
                            (k.weekly_quota_pct ?? 0) >= 100
                              ? "text-red-700 font-bold"
                              : (k.weekly_quota_pct ?? 0) >= 80
                                ? "text-amber-700"
                                : ""
                          }`}
                          title="คลิกเพื่อแก้ weekly quota"
                          onClick={async () => {
                            const v = window.prompt(
                              "Weekly quota (0=unlimited)",
                              String(k.weekly_quota_requests || 0),
                            );
                            if (v === null) return;
                            try {
                              await patchPartnerApiKey(k.api_key_id, {
                                weekly_quota_requests: Number(v) || 0,
                              });
                              await load();
                            } catch (e) {
                              alert(
                                e instanceof Error
                                  ? e.message
                                  : "อัปเดต quota ไม่สำเร็จ",
                              );
                            }
                          }}
                        >
                          {k.requests_7d ?? 0}/{k.weekly_quota_requests}
                          {k.weekly_quota_pct != null
                            ? ` (${k.weekly_quota_pct}%)`
                            : ""}
                        </button>
                      ) : (
                        <span className="text-slate-400 text-xs">∞</span>
                      )}
                    </td>
                    <td className="px-4 py-2">
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden min-w-[80px]">
                          <div
                            className={`h-full rounded-full ${
                              k.rate_usage_pct >= 90
                                ? "bg-red-500"
                                : k.rate_usage_pct >= 70
                                  ? "bg-amber-500"
                                  : "bg-emerald-500"
                            }`}
                            style={{ width: `${k.rate_usage_pct}%` }}
                          />
                        </div>
                        <span className="text-xs whitespace-nowrap">
                          {k.requests_this_minute}/{k.rate_limit_per_minute}
                        </span>
                      </div>
                      {k.near_rate_limit && (
                        <span className="text-[10px] text-amber-800 font-bold flex items-center gap-0.5 mt-0.5">
                          <AlertTriangle size={10} /> ใกล้ limit
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2">
                      <button
                        type="button"
                        onClick={() => toggleKey(k.api_key_id, !!k.is_active)}
                        className={`px-2 py-0.5 rounded text-xs font-bold ${
                          k.is_active
                            ? "bg-emerald-100 text-emerald-800"
                            : "bg-slate-200 text-slate-600"
                        }`}
                      >
                        {k.is_active ? "Active" : "Disabled"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b bg-slate-50 font-semibold text-sm flex flex-wrap items-center justify-between gap-2">
            <span className="flex items-center gap-2">
              <Activity size={16} /> Audit log
            </span>
            <div className="flex items-center gap-2">
              <select
                value={selectedKeyId}
                onChange={(e) => setSelectedKeyId(e.target.value)}
                className="border rounded px-2 py-1 text-xs"
              >
                <option value="">ทุก key</option>
                {keys.map((k) => (
                  <option key={k.id} value={k.id}>
                    {k.name}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() =>
                  setAuditFilter((f) => (f === "all" ? "errors" : "all"))
                }
                className={`px-2 py-1 rounded text-xs font-medium ${
                  auditFilter === "errors"
                    ? "bg-red-100 text-red-800"
                    : "bg-slate-100 text-slate-600"
                }`}
              >
                {auditFilter === "errors" ? "Errors only" : "All"}
              </button>
            </div>
          </div>
          {filteredAudit.length === 0 ? (
            <p className="p-6 text-sm text-slate-500">ยังไม่มี request</p>
          ) : (
            <div className="overflow-x-auto max-h-72 overflow-y-auto">
              <table className="w-full text-xs">
                <thead className="text-slate-500 uppercase bg-slate-50 sticky top-0">
                  <tr>
                    <th className="text-left px-3 py-2">Time</th>
                    <th className="text-left px-3 py-2">Key</th>
                    <th className="text-left px-3 py-2">Status</th>
                    <th className="text-left px-3 py-2">Endpoint</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredAudit.map((a) => (
                    <tr key={a.id} className="border-t border-slate-100">
                      <td className="px-3 py-1.5 whitespace-nowrap">
                        {new Date(a.created_at).toLocaleString()}
                      </td>
                      <td className="px-3 py-1.5">{a.key_name || "—"}</td>
                      <td className="px-3 py-1.5">
                        <span
                          className={
                            a.status_code >= 200 && a.status_code < 300
                              ? "text-emerald-600"
                              : a.status_code === 429
                                ? "text-amber-700 font-bold"
                                : "text-red-600"
                          }
                        >
                          {a.status_code}
                        </span>
                      </td>
                      <td className="px-3 py-1.5 font-mono truncate max-w-[180px]">
                        {a.method} {a.endpoint}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="rounded-xl border border-red-100 bg-white shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b bg-red-50 font-semibold text-sm flex items-center gap-2 text-red-900">
            <AlertTriangle size={16} /> Recent errors ({windowHours}h)
          </div>
          {(dashboard?.recent_errors || []).length === 0 ? (
            <p className="p-6 text-sm text-slate-500">ไม่มี error ในช่วงนี้</p>
          ) : (
            <div className="overflow-x-auto max-h-72 overflow-y-auto">
              <table className="w-full text-xs">
                <thead className="text-slate-500 uppercase bg-slate-50 sticky top-0">
                  <tr>
                    <th className="text-left px-3 py-2">Time</th>
                    <th className="text-left px-3 py-2">Key</th>
                    <th className="text-left px-3 py-2">Code</th>
                    <th className="text-left px-3 py-2">Detail</th>
                  </tr>
                </thead>
                <tbody>
                  {(dashboard?.recent_errors || []).map((a) => (
                    <tr
                      key={`err-${a.id}`}
                      className="border-t border-slate-100"
                    >
                      <td className="px-3 py-1.5 whitespace-nowrap">
                        {new Date(a.created_at).toLocaleString()}
                      </td>
                      <td className="px-3 py-1.5">{a.key_name || "—"}</td>
                      <td className="px-3 py-1.5 text-red-600 font-bold">
                        {a.status_code}
                      </td>
                      <td className="px-3 py-1.5 font-mono truncate max-w-[160px]">
                        {a.endpoint}
                        {a.request_meta &&
                        typeof a.request_meta === "object" &&
                        (a.request_meta as { reason?: string }).reason
                          ? ` (${(a.request_meta as { reason?: string }).reason})`
                          : ""}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      <div className="rounded-lg border border-indigo-100 bg-indigo-50 p-4 text-sm text-indigo-900 grid md:grid-cols-2 gap-4">
        <div>
          <p className="font-semibold mb-1 flex items-center gap-1">
            <Hash size={14} /> Endpoint
          </p>
          <code className="text-xs block">
            GET /api/v1/partner/trust/:userHash — header X-API-Key
          </code>
          <p className="text-xs mt-2 text-indigo-700">
            userHash = partner_hash ของ user ที่ consent แล้ว (32 hex)
          </p>
        </div>
        <div>
          <p className="font-semibold mb-1">Rate limit</p>
          <p className="text-xs text-indigo-700">
            In-memory per key (req/min) — 429 เมื่อเกิน · audit log เก็บทุก
            request ใน DB
          </p>
        </div>
      </div>
    </div>
  );
};
