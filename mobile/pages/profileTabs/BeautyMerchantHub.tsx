import React, { useCallback, useEffect, useState } from "react";
import {
  Store,
  List,
  Car,
  Wallet,
  MapPin,
  ChevronDown,
  Plus,
  Trash2,
  Loader2,
} from "lucide-react";
import { api } from "../../services/api";
import type { NotificationType } from "../../context/NotificationContext";
import { getServiceMerchantMeta } from "../../constants/serviceMerchantCategories";

const BLOCK =
  "rounded-2xl border border-sky-200 bg-sky-50/60 p-4 sm:p-5 shadow-sm ring-1 ring-sky-600/10";
const LABEL = "block text-sm font-semibold text-slate-800 mb-1.5";
const INPUT =
  "w-full px-3 py-2.5 rounded-xl border border-slate-300 bg-white text-slate-900 text-sm outline-none focus-visible:border-emerald-500 focus-visible:ring-2 focus-visible:ring-emerald-500/20";

type HubPanel = "shop" | "menu" | "transport" | "payment" | "modes" | null;

interface ServiceItem {
  id: string;
  item_type: "main" | "addon";
  title: string;
  price: number;
  duration_minutes: number;
  category: string;
  is_active: boolean;
}

interface BookingSettings {
  shop_name: string | null;
  shop_address: string | null;
  shop_lat: number | null;
  shop_lng: number | null;
  offers_at_shop: boolean;
  offers_at_home: boolean;
  vehicle_type: string | null;
  vehicle_plate: string | null;
  transport_rate_per_km: number | null;
  payment_mode: string;
  deposit_type: string;
  deposit_value: number;
}

export interface BeautyMerchantHubProps {
  expertCategory: string;
  expanded: boolean;
  onToggle: () => void;
  notify: (msg: string, type?: NotificationType) => void;
}

export const BeautyMerchantHub: React.FC<BeautyMerchantHubProps> = ({
  expertCategory,
  expanded,
  onToggle,
  notify,
}) => {
  const [panel, setPanel] = useState<HubPanel>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [services, setServices] = useState<ServiceItem[]>([]);
  const [settings, setSettings] = useState<BookingSettings | null>(null);
  const [newItem, setNewItem] = useState({
    title: "",
    price: "",
    item_type: "main" as "main" | "addon",
    duration_minutes: "30",
  });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [svcRes, setRes] = await Promise.all([
        api.get("/provider/services"),
        api.get("/provider/booking-settings"),
      ]);
      setServices(svcRes.data?.services || []);
      setSettings(setRes.data?.settings || null);
    } catch {
      notify("โหลดข้อมูลร้านไม่สำเร็จ", "error");
    } finally {
      setLoading(false);
    }
  }, [notify]);

  useEffect(() => {
    if (expanded) void load();
  }, [expanded, load]);

  const saveSettings = async (patch: Partial<BookingSettings>) => {
    setSaving(true);
    try {
      const res = await api.patch("/provider/booking-settings", patch);
      setSettings(res.data?.settings || null);
      notify("บันทึกแล้ว", "success");
    } catch (e: unknown) {
      const msg =
        (e as { response?: { data?: { error?: string } } })?.response?.data
          ?.error || "บันทึกไม่สำเร็จ";
      notify(msg, "error");
    } finally {
      setSaving(false);
    }
  };

  const addService = async () => {
    const title = newItem.title.trim();
    if (!title) return notify("กรุณาใส่ชื่อบริการ", "error");
    try {
      await api.post("/provider/services", {
        title,
        price: Number(newItem.price) || 0,
        item_type: newItem.item_type,
        duration_minutes: Number(newItem.duration_minutes) || 30,
      });
      setNewItem({
        title: "",
        price: "",
        item_type: "main",
        duration_minutes: "30",
      });
      notify("เพิ่มเมนูแล้ว", "success");
      void load();
    } catch {
      notify("เพิ่มเมนูไม่สำเร็จ", "error");
    }
  };

  const removeService = async (id: string) => {
    try {
      await api.delete(`/provider/services/${id}`);
      notify("ลบแล้ว", "success");
      void load();
    } catch {
      notify("ลบไม่สำเร็จ", "error");
    }
  };

  const meta = getServiceMerchantMeta(expertCategory);
  const menuCount = services.filter((s) => s.is_active).length;
  const shopPreview = settings?.shop_name || "ยังไม่ตั้งชื่อร้าน";
  const transportPreview =
    settings?.vehicle_plate && settings?.transport_rate_per_km
      ? `${settings.vehicle_plate} · ${settings.transport_rate_per_km} บาท/กม.`
      : "ยังไม่ตั้งรถ/อัตรา";

  if (!expanded) {
    return (
      <button
        type="button"
        onClick={onToggle}
        className={`${BLOCK} w-full text-left flex items-center gap-3 hover:bg-sky-50`}
      >
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-sky-100 text-sky-800">
          <Store size={20} />
        </span>
        <span className="flex-1 min-w-0">
          <span className="block font-semibold text-slate-800">
            จัดการร้าน & เมนูบริการ ({meta.label})
          </span>
          <span className="text-xs text-slate-600">
            แตะเพื่อเปิด Merchant Hub
          </span>
        </span>
        <ChevronDown size={18} className="text-slate-500" />
      </button>
    );
  }

  return (
    <section id="beauty-merchant-hub" className={BLOCK}>
      <div className="flex items-start justify-between gap-3 mb-4">
        <div>
          <h4 className="text-base font-bold text-slate-800">
            Merchant Hub — {meta.label}
          </h4>
          <p className="text-sm text-slate-600 mt-1">{meta.hubSubtitle}</p>
        </div>
        <button
          type="button"
          onClick={onToggle}
          className="text-sm text-slate-500 hover:text-slate-800 shrink-0"
        >
          ย่อ
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-8 text-slate-500">
          <Loader2 className="animate-spin" size={24} />
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2.5 mb-4">
            {(
              [
                {
                  key: "shop" as const,
                  Icon: Store,
                  title: "ข้อมูลร้าน",
                  preview: shopPreview,
                },
                {
                  key: "menu" as const,
                  Icon: List,
                  title: "เมนูบริการ",
                  preview: `${menuCount} รายการ`,
                },
                {
                  key: "transport" as const,
                  Icon: Car,
                  title: "ค่าเดินทาง & รถ",
                  preview: transportPreview,
                },
                {
                  key: "payment" as const,
                  Icon: Wallet,
                  title: "การชำระเงิน",
                  preview: settings?.payment_mode || "both",
                },
                {
                  key: "modes" as const,
                  Icon: MapPin,
                  title: "เปิดรับบริการ",
                  preview:
                    `${settings?.offers_at_shop ? "ที่ร้าน" : ""}${settings?.offers_at_shop && settings?.offers_at_home ? " · " : ""}${settings?.offers_at_home ? "นอกสถานที่" : ""}` ||
                    "—",
                },
              ] as const
            ).map(({ key, Icon, title, preview }) => (
              <button
                key={key}
                type="button"
                onClick={() => setPanel((p) => (p === key ? null : key))}
                className={`flex items-start gap-2 rounded-2xl border p-3 text-left text-sm transition ${
                  panel === key
                    ? "border-emerald-600 bg-emerald-50 ring-2 ring-emerald-500/40"
                    : "border-slate-200 bg-white hover:border-sky-300"
                }`}
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-sky-100 text-sky-800">
                  <Icon size={18} />
                </span>
                <span className="min-w-0">
                  <span className="font-semibold text-slate-800 block">
                    {title}
                  </span>
                  <span className="text-[11px] text-slate-600 line-clamp-2">
                    {preview}
                  </span>
                </span>
              </button>
            ))}
          </div>

          {panel === "shop" && settings && (
            <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-3 mb-2">
              <label className={LABEL}>{meta.shopNameLabel}</label>
              <input
                className={INPUT}
                value={settings.shop_name || ""}
                onChange={(e) =>
                  setSettings({ ...settings, shop_name: e.target.value })
                }
              />
              <label className={LABEL}>ที่อยู่ร้าน</label>
              <textarea
                className={`${INPUT} min-h-[4rem]`}
                value={settings.shop_address || ""}
                onChange={(e) =>
                  setSettings({ ...settings, shop_address: e.target.value })
                }
              />
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className={LABEL}>ละติจูด</label>
                  <input
                    className={INPUT}
                    type="number"
                    step="any"
                    value={settings.shop_lat ?? ""}
                    onChange={(e) =>
                      setSettings({
                        ...settings,
                        shop_lat: e.target.value
                          ? Number(e.target.value)
                          : null,
                      })
                    }
                  />
                </div>
                <div>
                  <label className={LABEL}>ลองจิจูด</label>
                  <input
                    className={INPUT}
                    type="number"
                    step="any"
                    value={settings.shop_lng ?? ""}
                    onChange={(e) =>
                      setSettings({
                        ...settings,
                        shop_lng: e.target.value
                          ? Number(e.target.value)
                          : null,
                      })
                    }
                  />
                </div>
              </div>
              <button
                type="button"
                disabled={saving}
                className="w-full py-2.5 rounded-xl bg-emerald-600 text-white font-semibold text-sm disabled:opacity-60"
                onClick={() => void saveSettings(settings)}
              >
                {saving ? "กำลังบันทึก…" : "บันทึกข้อมูลร้าน"}
              </button>
            </div>
          )}

          {panel === "menu" && (
            <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-3 mb-2">
              <ul className="space-y-2 max-h-48 overflow-y-auto">
                {services.map((s) => (
                  <li
                    key={s.id}
                    className="flex items-center justify-between gap-2 text-sm border-b border-slate-100 pb-2"
                  >
                    <span>
                      <span className="font-medium">{s.title}</span>
                      <span className="text-slate-500 ml-2">
                        ฿{s.price} · {s.item_type === "main" ? "หลัก" : "เสริม"}
                      </span>
                    </span>
                    <button
                      type="button"
                      onClick={() => void removeService(s.id)}
                      className="text-red-500 p-1"
                    >
                      <Trash2 size={16} />
                    </button>
                  </li>
                ))}
              </ul>
              <div className="grid grid-cols-2 gap-2">
                <select
                  className={INPUT}
                  value={newItem.item_type}
                  onChange={(e) =>
                    setNewItem({
                      ...newItem,
                      item_type: e.target.value as "main" | "addon",
                    })
                  }
                >
                  <option value="main">บริการหลัก</option>
                  <option value="addon">เสริม</option>
                </select>
                <input
                  className={INPUT}
                  placeholder="ราคา (บาท)"
                  type="number"
                  value={newItem.price}
                  onChange={(e) =>
                    setNewItem({ ...newItem, price: e.target.value })
                  }
                />
              </div>
              <input
                className={INPUT}
                placeholder={meta.menuPlaceholder}
                value={newItem.title}
                onChange={(e) =>
                  setNewItem({ ...newItem, title: e.target.value })
                }
              />
              <button
                type="button"
                onClick={() => void addService()}
                className="flex items-center justify-center gap-2 w-full py-2.5 rounded-xl border border-emerald-600 text-emerald-700 font-semibold text-sm"
              >
                <Plus size={18} /> เพิ่มเมนู
              </button>
            </div>
          )}

          {panel === "transport" && settings && (
            <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-3 mb-2">
              <label className={LABEL}>ประเภทรถ</label>
              <input
                className={INPUT}
                placeholder="รถจักรยานยนต์ / รถเก๋ง"
                value={settings.vehicle_type || ""}
                onChange={(e) =>
                  setSettings({ ...settings, vehicle_type: e.target.value })
                }
              />
              <label className={LABEL}>ทะเบียนรถ</label>
              <input
                className={INPUT}
                value={settings.vehicle_plate || ""}
                onChange={(e) =>
                  setSettings({ ...settings, vehicle_plate: e.target.value })
                }
              />
              <label className={LABEL}>อัตราต่อกิโลเมตร (8–15 บาท)</label>
              <input
                className={INPUT}
                type="number"
                min={8}
                max={15}
                step={0.5}
                value={settings.transport_rate_per_km ?? ""}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    transport_rate_per_km: e.target.value
                      ? Number(e.target.value)
                      : null,
                  })
                }
              />
              <p className="text-xs text-slate-500">
                ค่าแรกเข้า 45 บาท กำหนดโดยแพลตฟอร์ม
              </p>
              <button
                type="button"
                disabled={saving}
                className="w-full py-2.5 rounded-xl bg-emerald-600 text-white font-semibold text-sm"
                onClick={() => void saveSettings(settings)}
              >
                บันทึกค่าเดินทาง
              </button>
            </div>
          )}

          {panel === "payment" && settings && (
            <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-3 mb-2">
              <label className={LABEL}>โหมดชำระ</label>
              <select
                className={INPUT}
                value={settings.payment_mode}
                onChange={(e) =>
                  setSettings({ ...settings, payment_mode: e.target.value })
                }
              >
                <option value="both">มัดจำหรือเต็มจำนวน</option>
                <option value="deposit">มัดจำเท่านั้น</option>
                <option value="full_upfront">ชำระเต็มเท่านั้น</option>
              </select>
              <div className="grid grid-cols-2 gap-2">
                <select
                  className={INPUT}
                  value={settings.deposit_type}
                  onChange={(e) =>
                    setSettings({ ...settings, deposit_type: e.target.value })
                  }
                >
                  <option value="percent">เปอร์เซ็นต์</option>
                  <option value="fixed">จำนวนคงที่</option>
                </select>
                <input
                  className={INPUT}
                  type="number"
                  value={settings.deposit_value}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      deposit_value: Number(e.target.value),
                    })
                  }
                />
              </div>
              <button
                type="button"
                disabled={saving}
                className="w-full py-2.5 rounded-xl bg-emerald-600 text-white font-semibold text-sm"
                onClick={() => void saveSettings(settings)}
              >
                บันทึกการชำระเงิน
              </button>
            </div>
          )}

          {panel === "modes" && settings && (
            <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-3 mb-2">
              <label className="flex items-center gap-3 text-sm">
                <input
                  type="checkbox"
                  checked={settings.offers_at_shop}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      offers_at_shop: e.target.checked,
                    })
                  }
                />
                รับจองที่ร้าน
              </label>
              <label className="flex items-center gap-3 text-sm">
                <input
                  type="checkbox"
                  checked={settings.offers_at_home}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      offers_at_home: e.target.checked,
                    })
                  }
                />
                รับบริการนอกสถานที่
              </label>
              <button
                type="button"
                disabled={saving}
                className="w-full py-2.5 rounded-xl bg-emerald-600 text-white font-semibold text-sm"
                onClick={() => void saveSettings(settings)}
              >
                บันทึก
              </button>
            </div>
          )}
        </>
      )}
    </section>
  );
};

export {
  SERVICE_MERCHANT_CATEGORIES,
  BEAUTY_MERCHANT_CATEGORIES,
} from "../../constants/serviceMerchantCategories";
