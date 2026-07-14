import React, { useEffect, useState } from "react";
import { listPendingCreatives, moderateCreative, type PendingCreative } from "../services/adsAdminApi";

export const ModerationView: React.FC = () => {
  const [rows, setRows] = useState<PendingCreative[]>([]);
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true);
    listPendingCreatives()
      .then((r) => setRows(r.creatives || []))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, []);

  const act = async (id: string, state: "APPROVED" | "REJECTED") => {
    const note = state === "REJECTED" ? "Rejected by ads admin" : undefined;
    try {
      await moderateCreative(id, state, note);
      load();
    } catch (e) {
      alert(e instanceof Error ? e.message : "อนุมัติไม่สำเร็จ — ตรวจ backend / Social Core");
    }
  };

  return (
    <div className="bg-white rounded-xl border border-slate-100 overflow-hidden shadow-sm">
      <div className="px-4 py-3 border-b bg-slate-50 font-semibold">Creative moderation queue</div>
      {loading ? (
        <p className="p-4 text-slate-500">กำลังโหลด...</p>
      ) : rows.length === 0 ? (
        <p className="p-8 text-center text-slate-400">ไม่มี creative รออนุมัติ</p>
      ) : (
        <div className="divide-y">
          {rows.map((c) => (
            <div key={c.id} className="p-4">
              <div className="flex justify-between gap-4">
                <div>
                  <p className="font-semibold">{c.headline}</p>
                  <p className="text-sm text-slate-500 mt-1">{c.body}</p>
                  <p className="text-xs text-slate-400 mt-2">
                    {c.campaignTitle} · {c.advertiser}
                  </p>
                  <a href={c.destinationUrl} className="text-xs text-indigo-600" target="_blank" rel="noreferrer">
                    {c.destinationUrl}
                  </a>
                </div>
                <div className="flex flex-col gap-2 shrink-0">
                  <button
                    type="button"
                    className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-xs"
                    onClick={() => act(c.id, "APPROVED")}
                  >
                    อนุมัติ
                  </button>
                  <button
                    type="button"
                    className="px-3 py-1.5 rounded-lg bg-red-100 text-red-700 text-xs"
                    onClick={() => act(c.id, "REJECTED")}
                  >
                    ปฏิเสธ
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
