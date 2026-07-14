import React, { useEffect, useState } from "react";
import { listAdsAdminCampaigns, patchCampaignLifecycle, type AdsCampaign } from "../services/adsAdminApi";

export const CampaignsView: React.FC = () => {
  const [rows, setRows] = useState<AdsCampaign[]>([]);
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true);
    listAdsAdminCampaigns()
      .then((r) => setRows(r.campaigns || []))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, []);

  const setState = async (id: string, lifecycleState: string) => {
    await patchCampaignLifecycle(id, lifecycleState);
    load();
  };

  return (
    <div className="bg-white rounded-xl border border-slate-100 overflow-hidden shadow-sm">
      <div className="px-4 py-3 border-b bg-slate-50 font-semibold">Campaign review</div>
      {loading ? (
        <p className="p-4 text-slate-500">กำลังโหลด...</p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-slate-500 border-b bg-slate-50">
              <th className="p-3">Title</th>
              <th className="p-3">Advertiser</th>
              <th className="p-3">State</th>
              <th className="p-3">Budget (micro)</th>
              <th className="p-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((c) => (
              <tr key={c.id} className="border-b border-slate-50">
                <td className="p-3 font-medium">{c.title}</td>
                <td className="p-3">{c.advertiser}</td>
                <td className="p-3">
                  <span className="px-2 py-0.5 rounded-full text-xs bg-slate-100">{c.lifecycleState}</span>
                </td>
                <td className="p-3">{c.dailyBudgetMicro}</td>
                <td className="p-3 flex gap-2">
                  {c.lifecycleState === "ACTIVE" ? (
                    <button type="button" className="text-xs text-amber-600" onClick={() => setState(c.id, "PAUSED")}>
                      Pause
                    </button>
                  ) : (
                    <button type="button" className="text-xs text-emerald-600" onClick={() => setState(c.id, "ACTIVE")}>
                      Resume
                    </button>
                  )}
                  <button type="button" className="text-xs text-slate-500" onClick={() => setState(c.id, "ARCHIVED")}>
                    Archive
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
};
