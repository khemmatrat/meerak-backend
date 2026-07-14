import React, { useCallback, useEffect, useState } from "react";
import {
  listOutcomeAudit,
  reverseOutcome,
  rejectOutcomeDispute,
} from "../services/adsAdminApi";

type OutcomeRow = {
  id: string;
  campaign_id: string;
  conversion_kind: string;
  outcome_key: string;
  cost_micro: string;
  status?: string;
  dispute_reason?: string | null;
  public_click_id?: string | null;
  created_at: string;
};

const KIND_LABELS: Record<string, string> = {
  BOOKING_CONFIRMED: "จองยืนยัน",
  ORDER_PAID: "สั่งซื้อ/ชำระ",
  JOB_HIRED: "จ้างงาน",
};

const STATUS_STYLES: Record<string, string> = {
  billed: "bg-emerald-100 text-emerald-800",
  disputed: "bg-amber-100 text-amber-900",
  reversed: "bg-slate-100 text-slate-600",
};

function microToThb(micro: string | number): string {
  const n = Number(micro) / 1_000_000;
  return n.toFixed(2);
}

export const OutcomeAuditView: React.FC = () => {
  const [rows, setRows] = useState<OutcomeRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>("");
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    listOutcomeAudit(80, filter || undefined)
      .then((r) => setRows(r.outcomes || []))
      .catch(() => setRows([]))
      .finally(() => setLoading(false));
  }, [filter]);

  useEffect(() => {
    load();
  }, [load]);

  const onReverse = async (row: OutcomeRow) => {
    const note = window.prompt("เหตุผล reverse (คืน escrow):", "admin_reverse") || undefined;
    if (note === null) return;
    setBusyId(row.id);
    try {
      const out = await reverseOutcome(row.id, note);
      if (!out.reversed) alert("Reverse ไม่สำเร็จ — อาจ reverse ไปแล้ว");
      else alert(`คืน escrow แล้ว · ${microToThb(out.refundedMicro || row.cost_micro)} บาท`);
      load();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Reverse ไม่สำเร็จ");
    }
    setBusyId(null);
  };

  const onRejectDispute = async (row: OutcomeRow) => {
    const note = window.prompt("ปฏิเสธ dispute ของ advertiser:", "dispute_rejected") || undefined;
    if (note === null) return;
    setBusyId(row.id);
    try {
      await rejectOutcomeDispute(row.id, note);
      load();
    } catch (e) {
      alert(e instanceof Error ? e.message : "ปฏิเสธ dispute ไม่สำเร็จ");
    }
    setBusyId(null);
  };

  const filters = [
    { key: "", label: "ทั้งหมด" },
    { key: "billed", label: "Billed" },
    { key: "disputed", label: "Disputed" },
    { key: "reversed", label: "Reversed" },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {filters.map((f) => (
          <button
            key={f.key || "all"}
            type="button"
            onClick={() => setFilter(f.key)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold border ${
              filter === f.key
                ? "bg-indigo-600 text-white border-indigo-600"
                : "bg-white text-slate-600 border-slate-200 hover:border-indigo-300"
            }`}
          >
            {f.label}
          </button>
        ))}
        <button
          type="button"
          onClick={load}
          className="ml-auto px-3 py-1.5 rounded-lg text-xs font-semibold border border-slate-200 bg-white hover:bg-slate-50"
        >
          รีเฟรช
        </button>
      </div>

      <div className="bg-white rounded-xl border border-slate-100 overflow-hidden shadow-sm">
        <div className="px-4 py-3 border-b bg-slate-50 flex justify-between items-center">
          <span className="font-semibold text-slate-800">Outcome billing audit</span>
          <span className="text-xs text-slate-500">0.05 บาท / outcome · OUTCOME_ONLY</span>
        </div>

        {loading ? (
          <p className="p-6 text-slate-500 text-sm">กำลังโหลด...</p>
        ) : rows.length === 0 ? (
          <p className="p-10 text-center text-slate-400 text-sm">
            ยังไม่มี outcome billable
            {filter ? ` (status=${filter})` : ""}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-slate-500 border-b bg-slate-50/80">
                  <th className="px-4 py-2 font-semibold">เวลา</th>
                  <th className="px-4 py-2 font-semibold">Campaign</th>
                  <th className="px-4 py-2 font-semibold">Kind</th>
                  <th className="px-4 py-2 font-semibold">Outcome key</th>
                  <th className="px-4 py-2 font-semibold">฿</th>
                  <th className="px-4 py-2 font-semibold">Status</th>
                  <th className="px-4 py-2 font-semibold text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((row) => {
                  const st = row.status || "billed";
                  const canReverse = st === "billed" || st === "disputed";
                  const canRejectDispute = st === "disputed";
                  return (
                    <tr key={row.id} className="hover:bg-slate-50/50">
                      <td className="px-4 py-3 text-xs text-slate-500 whitespace-nowrap">
                        {new Date(row.created_at).toLocaleString("th-TH")}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-slate-700 max-w-[120px] truncate">
                        {row.campaign_id}
                      </td>
                      <td className="px-4 py-3 text-slate-800">
                        {KIND_LABELS[row.conversion_kind] || row.conversion_kind}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-slate-600 max-w-[140px] truncate">
                        {row.outcome_key}
                      </td>
                      <td className="px-4 py-3 font-semibold text-emerald-700">
                        {microToThb(row.cost_micro)}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`text-xs px-2 py-0.5 rounded-full font-semibold ${
                            STATUS_STYLES[st] || "bg-slate-100 text-slate-600"
                          }`}
                        >
                          {st}
                        </span>
                        {row.dispute_reason && (
                          <p className="text-[10px] text-amber-700 mt-1 max-w-[160px] truncate">
                            {row.dispute_reason}
                          </p>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        {canReverse && (
                          <button
                            type="button"
                            disabled={busyId === row.id}
                            onClick={() => onReverse(row)}
                            className="text-xs px-2.5 py-1 rounded-lg bg-red-50 text-red-700 border border-red-100 hover:bg-red-100 disabled:opacity-50 mr-1"
                          >
                            Reverse
                          </button>
                        )}
                        {canRejectDispute && (
                          <button
                            type="button"
                            disabled={busyId === row.id}
                            onClick={() => onRejectDispute(row)}
                            className="text-xs px-2.5 py-1 rounded-lg bg-slate-100 text-slate-700 border border-slate-200 hover:bg-slate-200 disabled:opacity-50"
                          >
                            ปฏิเสธ dispute
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <p className="text-xs text-slate-500 leading-relaxed">
        Reverse คืน escrow ให้ advertiser · ปฏิเสธ dispute = คงการหัก 0.05 บาท · Outcome มาจาก server hooks
        (booking / order / job hire) ไม่ใช่ client conversion
      </p>
    </div>
  );
};

export default OutcomeAuditView;
