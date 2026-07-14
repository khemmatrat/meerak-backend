import React, { useEffect, useState } from "react";
import {
  getBillingLedger,
  getBillingReconciliation,
  getFraudRecent,
  type BillingEntry,
  type BillingReconciliationReport,
  type FraudBlock,
} from "../services/adsAdminApi";
import { OutcomeAuditView } from "./OutcomeAuditView";

function eventLabel(type: string): string {
  const map: Record<string, string> = {
    ad_campaign_spend: "Campaign spend",
    ad_campaign_refund: "Refund",
    ad_render_credit: "Render credit",
    ad_render_failed_no_bill: "Failed render (no bill)",
    ad_impression_billable: "Billable impression",
    ad_video_view_billable: "Billable video view",
    ad_outcome_billable: "Outcome billable (0.05 THB)",
    ad_campaign_escrow_hold: "Escrow hold",
    ad_campaign_escrow_release: "Escrow release",
  };
  return map[type] || type;
}

export const BillingView: React.FC = () => {
  const [entries, setEntries] = useState<BillingEntry[]>([]);
  const [report, setReport] = useState<BillingReconciliationReport | null>(null);
  const [blocks, setBlocks] = useState<FraudBlock[]>([]);

  useEffect(() => {
    getBillingLedger(100).then((r) => setEntries(r.entries || []));
    getBillingReconciliation(7).then((r) => setReport(r.report || null)).catch(() => null);
    getFraudRecent(30).then((r) => setBlocks(r.blocks || [])).catch(() => null);
  }, []);

  return (
    <div className="space-y-6">
      {report ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-white rounded-xl border border-slate-100 p-4 shadow-sm">
            <p className="text-xs text-slate-500">Wallet spend (7d)</p>
            <p className="text-xl font-bold text-slate-900">
              {report.walletSpendThb.toLocaleString()} THB
            </p>
            <p className="text-xs text-slate-400">{report.walletSpendCampaigns} campaigns</p>
          </div>
          <div className="bg-white rounded-xl border border-slate-100 p-4 shadow-sm">
            <p className="text-xs text-slate-500">Billable delivery</p>
            <p className="text-xl font-bold text-emerald-700">
              {report.billableDeliveryEvents.toLocaleString()}
            </p>
            <p className="text-xs text-slate-400">viewable / 2s video</p>
          </div>
          <div className="bg-white rounded-xl border border-slate-100 p-4 shadow-sm">
            <p className="text-xs text-slate-500">Failed renders</p>
            <p className="text-xl font-bold text-rose-600">
              {report.failedRenderEvents.toLocaleString()}
            </p>
          </div>
          <div className="bg-white rounded-xl border border-slate-100 p-4 shadow-sm">
            <p className="text-xs text-slate-500">Credits / refunds</p>
            <p className="text-xl font-bold text-amber-700">
              {report.refundThb.toLocaleString()} THB
            </p>
            <p className="text-xs text-slate-400">{report.refundCount} events</p>
          </div>
        </div>
      ) : null}

      {blocks.length > 0 ? (
        <div className="bg-white rounded-xl border border-rose-100 overflow-hidden shadow-sm">
          <div className="px-4 py-3 border-b bg-rose-50 font-semibold text-rose-900">
            Recent fraud blocks
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-slate-500 border-b bg-slate-50">
                <th className="p-3">Reason</th>
                <th className="p-3">Score</th>
                <th className="p-3">Impression</th>
                <th className="p-3">When</th>
              </tr>
            </thead>
            <tbody>
              {blocks.map((b, i) => (
                <tr key={`${b.at}-${i}`} className="border-b border-slate-50">
                  <td className="p-3">{b.reason || "—"}</td>
                  <td className="p-3">{b.score ?? "—"}</td>
                  <td className="p-3 font-mono text-xs">
                    {b.publicImpressionId?.slice(0, 12) || "—"}…
                  </td>
                  <td className="p-3 text-slate-500">
                    {b.at ? new Date(b.at).toLocaleString() : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      <div className="bg-white rounded-xl border border-slate-100 overflow-hidden shadow-sm">
        <div className="px-4 py-3 border-b bg-slate-50 font-semibold">Ads billing ledger</div>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-slate-500 border-b bg-slate-50">
              <th className="p-3">Event</th>
              <th className="p-3">Amount</th>
              <th className="p-3">User</th>
              <th className="p-3">Date</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((e) => (
              <tr key={e.id} className="border-b border-slate-50">
                <td className="p-3">
                  <span className="font-medium">{eventLabel(e.event_type)}</span>
                  <span className="block text-xs text-slate-400 font-mono">{e.event_type}</span>
                </td>
                <td className="p-3">
                  {Number(e.amount) > 0
                    ? `${Number(e.amount).toLocaleString()} THB`
                    : "— (delivery accounting)"}
                </td>
                <td className="p-3 font-mono text-xs">{e.user_id?.slice(0, 8) || "—"}…</td>
                <td className="p-3 text-slate-500">{new Date(e.created_at).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <OutcomeAuditView />
    </div>
  );
};
