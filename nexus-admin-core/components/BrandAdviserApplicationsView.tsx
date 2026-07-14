import React, { useState, useEffect, useCallback } from "react";
import { Award, RefreshCw, Loader2, ExternalLink, CheckCircle, XCircle, Eye } from "lucide-react";
import { ADMIN_API_BASE, getAdminToken } from "../services/adminApi";

type ApplicationRow = {
  id: string;
  created_at: string;
  full_name: string;
  contact: string;
  primary_platform: string;
  primary_profile_url: string;
  link_youtube: string | null;
  link_tiktok: string | null;
  link_instagram: string | null;
  link_facebook: string | null;
  follower_count_declared: number | null;
  motivation: string | null;
  read_rules_accepted: boolean;
  status: string;
  admin_notes: string | null;
  reviewed_at: string | null;
  reviewed_by: string | null;
  linked_user_id: string | null;
};

async function fetchApplications(status: string): Promise<{
  applications: ApplicationRow[];
  pagination: { total: number };
  warning?: string;
}> {
  const token = getAdminToken();
  const q = status && status !== "all" ? `?status=${encodeURIComponent(status)}&limit=100` : "?limit=100";
  const res = await fetch(`${ADMIN_API_BASE}/api/admin/brand-adviser-applications${q}`, {
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(t.slice(0, 200));
  }
  return res.json();
}

async function patchApplication(
  id: string,
  body: { status: string; admin_notes?: string; linked_user_id?: string | null }
): Promise<void> {
  const token = getAdminToken();
  const res = await fetch(`${ADMIN_API_BASE}/api/admin/brand-adviser-applications/${id}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const j = await res.json().catch(() => ({}));
    throw new Error(j.error || res.statusText);
  }
}

export const BrandAdviserApplicationsView: React.FC = () => {
  const [rows, setRows] = useState<ApplicationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>("pending");
  const [notesById, setNotesById] = useState<Record<string, string>>({});
  const [linkedById, setLinkedById] = useState<Record<string, string>>({});
  const [actionId, setActionId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchApplications(filter);
      setRows(data.applications || []);
      if (data.warning) setError(`คำเตือน: ${data.warning}`);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "โหลดไม่สำเร็จ");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    load();
  }, [load]);

  const onPatch = async (id: string, status: string) => {
    setActionId(id);
    setError(null);
    try {
      await patchApplication(id, {
        status,
        admin_notes: notesById[id] ?? "",
        linked_user_id: linkedById[id]?.trim() || undefined,
      });
      await load();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "อัปเดตไม่สำเร็จ");
    } finally {
      setActionId(null);
    }
  };

  return (
    <div className="p-6 max-w-[1600px] mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <Award className="text-amber-600" />
            Brand Adviser — ใบสมัครจาก Landing
          </h1>
          <p className="text-sm text-slate-600 mt-1">
            ตรวจลิงก์และข้อมูลสาธารณะ — อนุมัติใบสมัครแล้วให้ไปที่{" "}
            <strong>User Management</strong> เพื่อค้นหาบัญชีจาก contact แล้วใช้{" "}
            <strong>Grant Brand Adviser</strong> เมื่อพร้อมมอบสิทธิ์ในระบบ
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white"
          >
            <option value="all">ทุกสถานะ</option>
            <option value="pending">รอตรวจ</option>
            <option value="under_review">กำลังตรวจ</option>
            <option value="approved">อนุมัติ (เอกสาร)</option>
            <option value="rejected">ปฏิเสธ</option>
          </select>
          <button
            type="button"
            onClick={() => load()}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-800 text-white text-sm hover:bg-slate-700"
          >
            <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
            รีเฟรช
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 text-amber-950 px-4 py-3 text-sm">{error}</div>
      )}

      {loading && !rows.length ? (
        <div className="flex justify-center py-20 text-slate-500">
          <Loader2 className="animate-spin" size={32} />
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-slate-700 text-left">
              <tr>
                <th className="px-3 py-2 font-semibold">วันที่</th>
                <th className="px-3 py-2 font-semibold">ชื่อ</th>
                <th className="px-3 py-2 font-semibold">ติดต่อ</th>
                <th className="px-3 py-2 font-semibold">ช่องหลัก</th>
                <th className="px-3 py-2 font-semibold">ฟอล/Sub</th>
                <th className="px-3 py-2 font-semibold max-w-[200px]">เจตนา (ย่อ)</th>
                <th className="px-3 py-2 font-semibold">สถานะ</th>
                <th className="px-3 py-2 font-semibold min-w-[200px]">หมายเหตุ / ผูก user UUID</th>
                <th className="px-3 py-2 font-semibold">การทำงาน</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t border-slate-100 align-top">
                  <td className="px-3 py-2 whitespace-nowrap text-slate-600">
                    {new Date(r.created_at).toLocaleString("th-TH")}
                  </td>
                  <td className="px-3 py-2 font-medium text-slate-900">{r.full_name}</td>
                  <td className="px-3 py-2 text-slate-700">{r.contact}</td>
                  <td className="px-3 py-2">
                    <span className="text-xs uppercase font-bold text-amber-800">{r.primary_platform}</span>
                    <a
                      href={r.primary_profile_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 text-blue-600 hover:underline mt-1"
                    >
                      <ExternalLink size={12} /> ลิงก์หลัก
                    </a>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {[r.link_youtube, r.link_tiktok, r.link_instagram, r.link_facebook].map(
                        (u, i) =>
                          u ? (
                            <a
                              key={i}
                              href={u}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 hover:bg-slate-200"
                            >
                              {["YT", "TT", "IG", "FB"][i]}
                            </a>
                          ) : null
                      )}
                    </div>
                  </td>
                  <td className="px-3 py-2 font-mono text-xs">
                    {r.follower_count_declared != null ? r.follower_count_declared.toLocaleString("th-TH") : "—"}
                  </td>
                  <td className="px-3 py-2 text-xs text-slate-600 max-w-[200px] align-top" title={r.motivation || ""}>
                    {r.motivation ? `${r.motivation.slice(0, 120)}${r.motivation.length > 120 ? "…" : ""}` : "—"}
                  </td>
                  <td className="px-3 py-2">
                    <span
                      className={`inline-flex px-2 py-0.5 rounded text-xs font-bold ${
                        r.status === "approved"
                          ? "bg-emerald-100 text-emerald-900"
                          : r.status === "rejected"
                            ? "bg-red-100 text-red-900"
                            : r.status === "under_review"
                              ? "bg-amber-100 text-amber-900"
                              : "bg-slate-100 text-slate-800"
                      }`}
                    >
                      {r.status}
                    </span>
                  </td>
                  <td className="px-3 py-2 space-y-1">
                    <textarea
                      placeholder="หมายเหตุแอดมิน"
                      value={notesById[r.id] ?? r.admin_notes ?? ""}
                      onChange={(e) => setNotesById((m) => ({ ...m, [r.id]: e.target.value }))}
                      className="w-full min-w-[180px] text-xs border border-slate-200 rounded p-1.5"
                      rows={2}
                    />
                    <input
                      type="text"
                      placeholder="linked_user_id (UUID)"
                      value={linkedById[r.id] ?? r.linked_user_id ?? ""}
                      onChange={(e) => setLinkedById((m) => ({ ...m, [r.id]: e.target.value }))}
                      className="w-full text-xs font-mono border border-slate-200 rounded px-2 py-1"
                    />
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    <div className="flex flex-col gap-1">
                      <button
                        type="button"
                        disabled={actionId === r.id}
                        onClick={() => onPatch(r.id, "under_review")}
                        className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded border border-amber-300 bg-amber-50 hover:bg-amber-100"
                      >
                        <Eye size={12} /> กำลังตรวจ
                      </button>
                      <button
                        type="button"
                        disabled={actionId === r.id}
                        onClick={() => onPatch(r.id, "approved")}
                        className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded border border-emerald-300 bg-emerald-50 text-emerald-900 hover:bg-emerald-100"
                      >
                        {actionId === r.id ? <Loader2 className="animate-spin" size={12} /> : <CheckCircle size={12} />}
                        อนุมัติ (เอกสาร)
                      </button>
                      <button
                        type="button"
                        disabled={actionId === r.id}
                        onClick={() => onPatch(r.id, "rejected")}
                        className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded border border-red-300 bg-red-50 text-red-900 hover:bg-red-100"
                      >
                        <XCircle size={12} /> ปฏิเสธ
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!rows.length && !loading && (
            <p className="text-center text-slate-500 py-12">ไม่มีรายการ</p>
          )}
        </div>
      )}
    </div>
  );
};
