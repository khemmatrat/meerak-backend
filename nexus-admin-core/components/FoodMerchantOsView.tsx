import React, { useCallback, useEffect, useState } from "react";
import {
  Loader2,
  RefreshCw,
  UtensilsCrossed,
} from "lucide-react";
import {
  getAdminFoodDashboard,
  getAdminFoodDispatch,
  getAdminFoodMerchants,
  getAdminFoodOrders,
  getAdminFoodRiders,
  getAdminFoodTrack,
  getAdminFoodTrackStreamUrl,
  type AdminFoodDashboard,
  type AdminFoodMerchantRow,
  type AdminFoodOrderRow,
  type AdminFoodRidersPayload,
  type AdminFoodTrackProjection,
  type AdminDispatchPipeline,
} from "../services/adminApi";
import { TrackOsDetailPanel } from "./TrackOsDetailPanel";

type TabId =
  | "dashboard"
  | "orders"
  | "merchants"
  | "riders"
  | "customers"
  | "finance"
  | "analytics"
  | "crm"
  | "ai-director"
  | "wallet"
  | "settings";

const TABS: { id: TabId; label: string }[] = [
  { id: "dashboard", label: "Dashboard" },
  { id: "orders", label: "Orders" },
  { id: "merchants", label: "Merchants" },
  { id: "riders", label: "Riders" },
  { id: "customers", label: "Customers" },
  { id: "finance", label: "Finance" },
  { id: "analytics", label: "Analytics" },
  { id: "crm", label: "CRM" },
  { id: "ai-director", label: "AI Director" },
  { id: "wallet", label: "Wallet" },
  { id: "settings", label: "Settings" },
];

function fmtThbMicro(micro: number) {
  return `฿${(micro / 100).toLocaleString("th-TH", { minimumFractionDigits: 0 })}`;
}

function fmtDt(iso?: string) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("th-TH");
  } catch {
    return iso;
  }
}

function StatCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-xs font-medium text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-bold text-slate-900">{value}</p>
      {sub && <p className="mt-1 text-xs text-slate-500">{sub}</p>}
    </div>
  );
}

function PlaceholderPanel({ title, note }: { title: string; note: string }) {
  return (
    <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center">
      <p className="font-semibold text-slate-800">{title}</p>
      <p className="mt-2 text-sm text-slate-500">{note}</p>
    </div>
  );
}

type Props = {
  onOpenUser?: (userId: string) => void;
};

export function FoodMerchantOsView({ onOpenUser }: Props) {
  const [tab, setTab] = useState<TabId>("dashboard");
  const [loading, setLoading] = useState(true);
  const [dash, setDash] = useState<AdminFoodDashboard | null>(null);
  const [orders, setOrders] = useState<AdminFoodOrderRow[]>([]);
  const [merchants, setMerchants] = useState<AdminFoodMerchantRow[]>([]);
  const [ridersData, setRidersData] = useState<AdminFoodRidersPayload | null>(null);
  const [dispatchPipe, setDispatchPipe] = useState<AdminDispatchPipeline | null>(null);
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [trackProjection, setTrackProjection] = useState<AdminFoodTrackProjection | null>(null);
  const [trackLoading, setTrackLoading] = useState(false);
  const [trackLive, setTrackLive] = useState(false);
  const [error, setError] = useState("");

  const reload = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [d, o, m, r, dp] = await Promise.all([
        getAdminFoodDashboard(),
        getAdminFoodOrders({ limit: 40 }),
        getAdminFoodMerchants(),
        getAdminFoodRiders().catch(() => null),
        getAdminFoodDispatch().catch(() => null),
      ]);
      setDash(d);
      setOrders(o.orders || []);
      setMerchants(m.merchants || []);
      setRidersData(r);
      setDispatchPipe(dp);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "โหลดข้อมูลไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const loadTrackOs = useCallback(async (orderId: string) => {
    setTrackLoading(true);
    try {
      const data = await getAdminFoodTrack(orderId);
      setTrackProjection(data);
    } catch {
      setTrackProjection(null);
    } finally {
      setTrackLoading(false);
    }
  }, []);

  const openOrderTrack = async (orderId: string) => {
    setSelectedOrderId(orderId);
    await loadTrackOs(orderId);
  };

  useEffect(() => {
    if (!selectedOrderId) {
      setTrackLive(false);
      return;
    }
    setTrackLive(true);
    const streamUrl = getAdminFoodTrackStreamUrl(selectedOrderId);
    let es: EventSource | null = null;
    try {
      es = new EventSource(streamUrl);
      es.onmessage = () => {
        void loadTrackOs(selectedOrderId);
      };
      es.onerror = () => {
        setTrackLive(false);
      };
    } catch {
      setTrackLive(false);
    }
    const poll = window.setInterval(() => {
      void loadTrackOs(selectedOrderId);
    }, 8000);
    return () => {
      window.clearInterval(poll);
      es?.close();
      setTrackLive(false);
    };
  }, [selectedOrderId, loadTrackOs]);

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
        <p className="font-semibold">คอนโซลหลัก — Platform Admin</p>
        <p className="mt-1 text-amber-900/90">
          Food OS · dispatch · timeline · analytics อยู่ที่นี่ (nexus-admin)
          — หน้า <code className="rounded bg-amber-100 px-1">/m/admin</code> บนมือถือสำรองฉุกเฉินเท่านั้น
          (อนุมัติร้าน / ข้อพิพาท)
        </p>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <UtensilsCrossed className="h-6 w-6 text-emerald-600" />
          <div>
            <h2 className="text-lg font-bold text-slate-900">Food Merchant OS</h2>
            <p className="text-xs text-slate-500">Super App control center — อาหาร · ร้านค้า · ไรเดอร์ · การเงิน</p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => void reload()}
          className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          รีเฟรช
        </button>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      )}

      <div className="overflow-x-auto">
        <div className="flex min-w-max rounded-lg border border-slate-200 bg-slate-50 p-0.5">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`whitespace-nowrap px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                tab === t.id ? "bg-white text-emerald-700 shadow-sm" : "text-slate-600 hover:text-slate-900"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {tab === "dashboard" && dash && (
        <div className="space-y-6">
          <section>
            <h3 className="mb-3 text-sm font-bold text-slate-700">วันนี้</h3>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <StatCard label="Orders Today" value={dash.today.orders} />
              <StatCard label="Completed" value={dash.today.completed} />
              <StatCard label="Cooking" value={dash.today.cooking} />
              <StatCard label="Waiting Rider" value={dash.today.waiting_rider} />
              <StatCard label="Delivering" value={dash.today.delivering} />
              <StatCard label="Cancelled" value={dash.today.cancelled} />
              <StatCard label="Revenue Today" value={fmtThbMicro(dash.today.gmv_micro)} />
              <StatCard label="Unique Customers" value={dash.today.unique_customers} />
            </div>
          </section>

          <section>
            <h3 className="mb-3 text-sm font-bold text-slate-700">รายได้แยกส่วน</h3>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <StatCard label="GMV Today" value={fmtThbMicro(dash.today.gmv_micro)} />
              <StatCard label="Platform Fee" value={fmtThbMicro(dash.today.platform_fee_micro)} />
              <StatCard label="Merchant Income" value={fmtThbMicro(dash.today.merchant_income_micro)} />
              <StatCard label="Rider Income" value={fmtThbMicro(dash.today.rider_income_micro)} />
            </div>
          </section>

          <section>
            <h3 className="mb-3 text-sm font-bold text-slate-700">Merchants & Wallet</h3>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <StatCard label="ร้านทั้งหมด" value={dash.merchants.total} sub={`เปิด ${dash.merchants.open} · ปิด ${dash.merchants.closed}`} />
              <StatCard label="รอตรวจ" value={dash.merchants.pending_review} />
              <StatCard label="ถูกระงับ" value={dash.merchants.suspended} />
              <StatCard label="Wallet Balance" value={fmtThbMicro(dash.wallet.balance_micro)} sub={`ถอนรอ ${fmtThbMicro(dash.wallet.pending_withdraw_micro)}`} />
            </div>
          </section>

          <section>
            <h3 className="mb-3 text-sm font-bold text-slate-700">Dispatch Pipeline</h3>
            {dispatchPipe ? (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                <StatCard label="รอไรเดอร์" value={dispatchPipe.pipeline.waiting_rider.length} />
                <StatCard label="มอบหมายแล้ว" value={dispatchPipe.pipeline.assigned.length} />
                <StatCard label="รับของแล้ว" value={dispatchPipe.pipeline.picked.length} />
                <StatCard label="กำลังส่ง" value={dispatchPipe.pipeline.delivering.length} />
                <StatCard label="สำเร็จ" value={dispatchPipe.pipeline.completed.length} />
              </div>
            ) : (
              <PlaceholderPanel title="Dispatch Engine" note="รอ dispatch-svc หรือ local dev jobs" />
            )}
          </section>

          <PlaceholderPanel
            title="Live Map"
            note="Heat map + rider/merchant pins — ขั้นถัดไป (P3)"
          />
        </div>
      )}

      {tab === "orders" && (
        <div className="space-y-4">
          <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-4 py-3">Order</th>
                  <th className="px-4 py-3">ร้าน</th>
                  <th className="px-4 py-3">สถานะ</th>
                  <th className="px-4 py-3">ยอด</th>
                  <th className="px-4 py-3">ชำระ</th>
                  <th className="px-4 py-3">เวลา</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((o) => (
                  <tr
                    key={o.order_id}
                    className={`border-t border-slate-100 cursor-pointer hover:bg-emerald-50/50${selectedOrderId === o.order_id ? " bg-emerald-50" : ""}`}
                    onClick={() => void openOrderTrack(o.order_id)}
                  >
                    <td className="px-4 py-3 font-mono text-xs">{o.order_id.slice(0, 16)}…</td>
                    <td className="px-4 py-3">{o.merchant_name || o.merchant_id}</td>
                    <td className="px-4 py-3">
                      <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-800">
                        {o.fulfillment_status}
                      </span>
                    </td>
                    <td className="px-4 py-3">{fmtThbMicro(o.amount_micro)}</td>
                    <td className="px-4 py-3">{o.method}</td>
                    <td className="px-4 py-3 text-xs text-slate-500">{fmtDt(o.created_at)}</td>
                  </tr>
                ))}
                {!orders.length && (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-slate-500">
                      ยังไม่มีออเดอร์อาหารในระบบ
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {selectedOrderId && (
            <TrackOsDetailPanel
              orderId={selectedOrderId}
              projection={trackProjection}
              loading={trackLoading}
              live={trackLive}
              onRefresh={() => void loadTrackOs(selectedOrderId)}
              onOpenUser={onOpenUser}
            />
          )}
        </div>
      )}

      {tab === "merchants" && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {merchants.map((m) => (
            <div key={m.merchant_id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-start gap-3">
                <span className="text-2xl">{m.emoji}</span>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-slate-900">{m.name}</p>
                  <p className="text-xs text-slate-500">{m.cuisine} · ⭐ {m.rating}</p>
                  <p className="mt-2 text-xs">
                    <span className={m.open ? "text-emerald-600" : "text-red-600"}>{m.open ? "เปิดร้าน" : "ปิดร้าน"}</span>
                    {" · "}
                    ส่ง {fmtThbMicro(m.delivery_fee_micro)}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {tab === "riders" && ridersData && (
        <div className="space-y-6">
          <div className="grid gap-3 sm:grid-cols-3">
            <StatCard label="งานเปิดรอรับ" value={ridersData.summary.open_jobs} />
            <StatCard label="กำลังส่ง" value={ridersData.summary.active_deliveries} />
            <StatCard label="ไรเดอร์ออนไลน์" value={ridersData.summary.riders_online} />
          </div>

          {ridersData.ops && (
            <section className="rounded-xl border border-amber-200 bg-amber-50/60 p-4">
              <h3 className="mb-3 text-sm font-bold text-amber-900">Rider Ops — ต้องติดตาม</h3>
              <div className="mb-4 grid gap-3 sm:grid-cols-3">
                <StatCard
                  label="ถอนค้างอนุมัติ"
                  value={ridersData.ops.counts.pending_withdrawals}
                />
                <StatCard
                  label="เครดิตใกล้หมด"
                  value={ridersData.ops.counts.credit_stressed}
                />
                <StatCard
                  label="งานค้าง (stuck)"
                  value={ridersData.ops.counts.stuck_jobs}
                  sub="ไม่มีความคืบหน้า >90 นาที"
                />
              </div>
              {ridersData.ops.stuck_jobs.length > 0 && (
                <div className="mb-3">
                  <p className="mb-2 text-xs font-semibold text-slate-700">งาน stuck</p>
                  <ul className="space-y-1 text-xs text-slate-600">
                    {ridersData.ops.stuck_jobs.slice(0, 5).map((j) => (
                      <li key={j.id}>
                        #{j.order_id.slice(-8)} · {j.phase} · ค้าง {j.idle_minutes} นาที
                        {j.rider_id ? ` · ${j.rider_id.slice(0, 10)}` : ""}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {ridersData.ops.pending_withdrawals.length > 0 && (
                <div className="mb-3">
                  <p className="mb-2 text-xs font-semibold text-slate-700">ถอนเงินค้าง</p>
                  <ul className="space-y-1 text-xs text-slate-600">
                    {ridersData.ops.pending_withdrawals.slice(0, 5).map((w) => (
                      <li key={w.payout_id}>
                        {w.rider_id.slice(0, 12)} · {fmtThbMicro(w.amount_micro)} · {fmtDt(w.created_at)}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </section>
          )}

          <section>
            <h3 className="mb-3 text-sm font-bold text-slate-700">Dispatch Jobs</h3>
            <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
                  <tr>
                    <th className="px-4 py-3">Job</th>
                    <th className="px-4 py-3">ร้าน</th>
                    <th className="px-4 py-3">สถานะ</th>
                    <th className="px-4 py-3">ไรเดอร์</th>
                    <th className="px-4 py-3">ยอด</th>
                  </tr>
                </thead>
                <tbody>
                  {ridersData.jobs.map((j) => (
                    <tr key={j.id} className="border-t border-slate-100">
                      <td className="px-4 py-3 font-mono text-xs">{j.order_id.slice(0, 14)}…</td>
                      <td className="px-4 py-3">{j.merchant_name || "—"}</td>
                      <td className="px-4 py-3">
                        <span className="rounded-full bg-sky-50 px-2 py-0.5 text-xs font-medium text-sky-800">
                          {j.phase}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs">{j.rider_id?.slice(0, 12) || "—"}</td>
                      <td className="px-4 py-3">{fmtThbMicro(j.amount_micro || 0)}</td>
                    </tr>
                  ))}
                  {!ridersData.jobs.length && (
                    <tr>
                      <td colSpan={5} className="px-4 py-8 text-center text-slate-500">
                        ยังไม่มีงาน dispatch — รอร้านกดพร้อมส่ง
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>

          <section>
            <h3 className="mb-3 text-sm font-bold text-slate-700">Event Timeline (AQOND Event Bus)</h3>
            <div className="space-y-2">
              {ridersData.recent_events.map((e) => (
                <div key={e.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-100 bg-white px-3 py-2 text-sm">
                  <span className="rounded bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-800">
                    {e.event_type}
                  </span>
                  <span className="font-mono text-xs text-slate-500">{e.order_id.slice(0, 16)}…</span>
                  <span className="text-xs text-slate-400">{fmtDt(e.at)}</span>
                  <span className="text-xs text-slate-400">via {e.source}</span>
                </div>
              ))}
              {!ridersData.recent_events.length && (
                <p className="text-sm text-slate-500">ยังไม่มี event — จะปรากฏเมื่อมีออเดอร์/ไรเดอร์ทำงาน</p>
              )}
            </div>
          </section>
        </div>
      )}

      {tab === "riders" && !ridersData && !loading && (
        <PlaceholderPanel title="Rider Operations" note="โหลด dispatch + event bus ไม่สำเร็จ" />
      )}

      {tab === "customers" && (
        <PlaceholderPanel
          title="Customers"
          note="Active / Repeat / LTV — ต่อ order-svc + user admin"
        />
      )}

      {tab === "finance" && dash && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <StatCard label="GMV Today" value={fmtThbMicro(dash.today.gmv_micro)} />
          <StatCard label="Platform Revenue" value={fmtThbMicro(dash.today.platform_fee_micro)} />
          <StatCard label="Escrow / Wallet" value={fmtThbMicro(dash.wallet.balance_micro)} />
        </div>
      )}

      {tab === "analytics" && (
        <PlaceholderPanel title="Analytics" note="Top Foods · Peak Hours · Retention — ต่อ merchantSalesAnalytics + growth" />
      )}

      {tab === "crm" && (
        <PlaceholderPanel title="CRM" note="Coupons · Campaigns · Push · Segments — ต่อ promotions-svc + notify" />
      )}

      {tab === "ai-director" && (
        <PlaceholderPanel title="AI Director" note="AQOND Brain · Merchant Ads · Demand prediction — ต่อ aivos/merchant-ad" />
      )}

      {tab === "wallet" && dash && (
        <div className="grid gap-3 sm:grid-cols-2">
          <StatCard label="Wallet Balance" value={fmtThbMicro(dash.wallet.balance_micro)} />
          <StatCard label="Pending Withdraw" value={fmtThbMicro(dash.wallet.pending_withdraw_micro)} />
        </div>
      )}

      {tab === "settings" && (
        <PlaceholderPanel title="Settings" note="Commission · Delivery radius · Feature flags — ต่อ merchant-ops-svc" />
      )}

      {tab === "dashboard" && !dash && !loading && (
        <PlaceholderPanel title="ไม่มีข้อมูล" note="ตรวจว่า backend :3001 และ storefront :3003 รันอยู่" />
      )}
    </div>
  );
}
