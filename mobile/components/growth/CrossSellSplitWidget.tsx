import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  activateAqondPass,
  fetchAqondPassStatus,
  type AqondPassStatus,
} from "../../services/growthEngineService";
import { navigateToMarketplace } from "../../services/marketplaceHandoff";

type Props = {
  amountPaid?: string;
  onActivated?: () => void;
};

export function CrossSellSplitWidget({ amountPaid, onActivated }: Props) {
  const navigate = useNavigate();
  const [status, setStatus] = useState<AqondPassStatus | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetchAqondPassStatus()
      .then(setStatus)
      .catch(() => setStatus(null));
  }, []);

  const primaryPct = status?.crossSell?.primaryPct ?? 70;
  const bonusPct = status?.crossSell?.bonusPct ?? 30;

  const handleStart = async () => {
    setBusy(true);
    try {
      const s = await activateAqondPass();
      setStatus(s);
      onActivated?.();
    } catch {
      // ignore — user can open Pass from storefront later
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="w-full mb-6 rounded-2xl border border-emerald-200 bg-gradient-to-br from-emerald-50 to-cyan-50 p-4 text-left">
      <h3 className="text-sm font-bold text-gray-900 mb-3">แบ่งยอดชำระของคุณ</h3>
      <div className="flex gap-1.5 h-14 mb-3">
        <div
          className="rounded-xl bg-emerald-100 text-emerald-900 px-3 py-2 flex flex-col justify-center min-w-0"
          style={{ flex: primaryPct }}
        >
          <span className="text-[10px] uppercase tracking-wide opacity-80">ชำระแล้ว</span>
          <strong className="text-base truncate">{amountPaid || "✓"}</strong>
        </div>
        <div
          className="rounded-xl bg-cyan-100 text-cyan-900 px-3 py-2 flex flex-col justify-center min-w-0"
          style={{ flex: bonusPct }}
        >
          <span className="text-[10px] uppercase tracking-wide opacity-80">สะสม Pass</span>
          <strong className="text-base">+{bonusPct}%</strong>
        </div>
      </div>
      <p className="text-xs text-gray-600 mb-3 leading-relaxed">
        {status?.active
          ? `AQOND Pass เฟส ${status.phase}/6 — ${status.crossSell?.message || "ช้อปต่อเพื่อปลดเฟสถัดไป"}`
          : "เริ่ม AQOND Pass 6 เดือน — รับส่วนลดล็อกหมวดโปรดเดือนที่ 4"}
      </p>
      {status?.active ? (
        <button
          type="button"
          onClick={() => navigateToMarketplace(navigate, "/m/pass")}
          className="w-full py-3 rounded-xl bg-gradient-to-r from-emerald-600 to-cyan-600 text-white font-bold text-sm"
        >
          ดู AQOND Pass
        </button>
      ) : (
        <button
          type="button"
          disabled={busy}
          onClick={() => void handleStart()}
          className="w-full py-3 rounded-xl bg-gradient-to-r from-emerald-600 to-cyan-600 text-white font-bold text-sm disabled:opacity-60"
        >
          {busy ? "กำลังเปิด…" : "เริ่ม AQOND Pass ฟรี"}
        </button>
      )}
    </section>
  );
}
