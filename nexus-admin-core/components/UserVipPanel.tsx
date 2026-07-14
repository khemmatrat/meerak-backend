import React, { useCallback, useEffect, useState } from "react";
import { Crown, Loader2, RefreshCw } from "lucide-react";
import {
  getAdminUserVipMembership,
  setUserVip,
  type AdminVipMembership,
  type AdminVipOrderRow,
} from "../services/adminApi";

const TIER_LABEL: Record<string, string> = {
  silver: "Silver",
  gold: "Gold",
  platinum: "Platinum",
  none: "—",
};

const STATUS_LABEL: Record<string, { text: string; className: string }> = {
  active: { text: "ใช้งานอยู่", className: "bg-emerald-100 text-emerald-800" },
  pending_payment: {
    text: "รอชำระเงิน",
    className: "bg-amber-100 text-amber-900",
  },
  processing: {
    text: "กำลังดำเนินการซื้อ",
    className: "bg-sky-100 text-sky-900",
  },
  expired: { text: "หมดอายุ", className: "bg-slate-200 text-slate-700" },
  none: { text: "ยังไม่มี VIP", className: "bg-slate-100 text-slate-600" },
};

function fmtDt(iso: string | null | undefined) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("th-TH", {
      dateStyle: "medium",
      timeStyle: "short",
    });
  } catch {
    return iso;
  }
}

function tierBadge(tier: string) {
  const t = (tier || "none").toLowerCase();
  const colors: Record<string, string> = {
    silver: "bg-slate-200 text-slate-800 border-slate-300",
    gold: "bg-amber-100 text-amber-900 border-amber-300",
    platinum: "bg-violet-100 text-violet-900 border-violet-300",
  };
  return (
    <span
      className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-bold border ${
        colors[t] || "bg-slate-100 text-slate-600"
      }`}
    >
      {TIER_LABEL[t] || tier}
    </span>
  );
}

function orderStatusBadge(status: string) {
  const map: Record<string, string> = {
    active: "bg-emerald-100 text-emerald-800",
    processing: "bg-sky-100 text-sky-800",
    pending: "bg-amber-100 text-amber-900",
    expired: "bg-slate-200 text-slate-700",
    cancelled: "bg-rose-50 text-rose-700",
    failed: "bg-rose-100 text-rose-800",
  };
  return (
    <span
      className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${map[status] || "bg-slate-100"}`}
    >
      {status}
    </span>
  );
}

type Props = {
  userId: string;
  canManage: boolean;
  manualVip: boolean;
  onManualVipChange?: (isVip: boolean) => void;
  onNotice?: (msg: string, type?: "success" | "error") => void;
};

export const UserVipPanel: React.FC<Props> = ({
  userId,
  canManage,
  manualVip,
  onManualVipChange,
  onNotice,
}) => {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<AdminVipMembership | null>(null);
  const [acting, setActing] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getAdminUserVipMembership(userId);
      setData(res);
    } catch (e: unknown) {
      onNotice?.((e as Error)?.message || "โหลด VIP ไม่สำเร็จ", "error");
    } finally {
      setLoading(false);
    }
  }, [userId, onNotice]);

  useEffect(() => {
    void load();
  }, [load]);

  const toggleManualVip = async (checked: boolean) => {
    if (!canManage) return;
    setActing(true);
    try {
      await setUserVip(userId, checked);
      onManualVipChange?.(checked);
      onNotice?.(
        checked ? "ตั้ง VIP (manual) แล้ว" : "ยกเลิก VIP (manual) แล้ว",
        "success",
      );
      await load();
    } catch (e: unknown) {
      onNotice?.((e as Error)?.message || "อัปเดต VIP ไม่สำเร็จ", "error");
    } finally {
      setActing(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-4 text-slate-400">
        <Loader2 className="animate-spin" size={20} />
      </div>
    );
  }

  const cur = data?.current;
  const st = STATUS_LABEL[cur?.display_status || "none"] || STATUS_LABEL.none;

  return (
    <section className="mb-6 space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h4 className="text-sm font-bold text-slate-600 uppercase flex items-center gap-2">
          <Crown size={16} className="text-amber-600" /> VIP Membership
        </h4>
        <button
          type="button"
          onClick={() => void load()}
          className="text-xs text-indigo-600 hover:text-indigo-800 inline-flex items-center gap-1"
        >
          <RefreshCw size={12} /> รีเฟรช
        </button>
      </div>

      {/* สถานะปัจจุบัน */}
      <div className="rounded-lg border border-amber-200 bg-gradient-to-br from-amber-50/80 to-white p-4 grid gap-3 sm:grid-cols-2">
        <div>
          <p className="text-xs text-slate-500 mb-1">แผนปัจจุบัน</p>
          <div className="flex flex-wrap items-center gap-2">
            {tierBadge(cur?.tier || "none")}
            <span
              className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${st.className}`}
            >
              {st.text}
            </span>
          </div>
        </div>
        <div>
          <p className="text-xs text-slate-500 mb-1">โควต้าส่วนลดคงเหลือ</p>
          <p className="font-mono font-semibold text-slate-900">
            {cur?.vip_quota_balance != null ? cur.vip_quota_balance : "—"}
          </p>
        </div>
        <div>
          <p className="text-xs text-slate-500 mb-1">เริ่มสิทธิ์</p>
          <p className="text-sm font-medium text-slate-900">
            {fmtDt(cur?.vip_started_at)}
          </p>
        </div>
        <div>
          <p className="text-xs text-slate-500 mb-1">สิ้นสุดสิทธิ์</p>
          <p className="text-sm font-medium text-slate-900">
            {fmtDt(cur?.vip_expiry)}
          </p>
        </div>
      </div>

      {cur?.pending_order && (
        <div className="rounded-lg border border-sky-300 bg-sky-50 px-4 py-3 text-sm text-sky-900">
          <strong>กำลังซื้อ / รอชำระ:</strong>{" "}
          {TIER_LABEL[cur.pending_order.tier] || cur.pending_order.tier} ·{" "}
          {orderStatusBadge(cur.pending_order.status)} · สร้างเมื่อ{" "}
          {fmtDt(cur.pending_order.created_at)}
        </div>
      )}

      {/* ตารางประวัติรายเดือน */}
      <div className="border border-slate-200 rounded-lg overflow-x-auto">
        <table className="w-full text-xs min-w-[720px]">
          <thead className="bg-slate-50 text-slate-500 uppercase">
            <tr>
              <th className="px-3 py-2 text-left">เดือน</th>
              <th className="px-3 py-2 text-left">แผน</th>
              <th className="px-3 py-2 text-left">สถานะ</th>
              <th className="px-3 py-2 text-right">ราคา (฿)</th>
              <th className="px-3 py-2 text-left">เริ่ม</th>
              <th className="px-3 py-2 text-left">สิ้นสุด</th>
              <th className="px-3 py-2 text-left">ชำระเมื่อ</th>
            </tr>
          </thead>
          <tbody>
            {!data?.history?.length ? (
              <tr>
                <td
                  colSpan={7}
                  className="px-3 py-4 text-center text-slate-400"
                >
                  ยังไม่มีประวัติการซื้อ VIP
                </td>
              </tr>
            ) : (
              data.history.map((row: AdminVipOrderRow) => (
                <tr key={row.id} className="border-t border-slate-100">
                  <td className="px-3 py-2 font-medium">
                    {row.billing_month || "—"}
                  </td>
                  <td className="px-3 py-2">{tierBadge(row.tier)}</td>
                  <td className="px-3 py-2">{orderStatusBadge(row.status)}</td>
                  <td className="px-3 py-2 text-right font-mono">
                    {row.amount_baht != null
                      ? row.amount_baht.toLocaleString("th-TH")
                      : "—"}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    {fmtDt(row.started_at)}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    {fmtDt(row.expires_at)}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    {fmtDt(row.paid_at)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <p className="text-[11px] text-slate-500">
        เมื่อ user ซื้อสำเร็จ ระบบอนุมัติ VIP อัตโนมัติ ·
        เมื่อหมดอายุระบบส่งข้อความเชิญต่ออายุ/โปรใหม่ให้ user
      </p>

      {canManage && (
        <label className="flex items-center gap-2 cursor-pointer pt-2 border-t border-slate-100">
          <input
            type="checkbox"
            checked={manualVip}
            onChange={(e) => void toggleManualVip(e.target.checked)}
            disabled={acting}
            className="rounded border-slate-300"
          />
          <span className="text-sm text-slate-600">
            Manual VIP flag (override — ไม่แทนแผน Silver/Gold/Platinum ด้านบน)
          </span>
        </label>
      )}
    </section>
  );
};
