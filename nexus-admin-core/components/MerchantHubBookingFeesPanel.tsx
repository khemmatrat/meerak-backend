/**
 * Admin — Merchant Hub Booking fee policy (Barber / Beauty / Chef / Tailor / Artist).
 */
import React, { useCallback, useEffect, useState } from "react";
import { Loader2, Percent, Save, Store } from "lucide-react";
import {
  getAdminBeautyBookingPolicy,
  patchAdminBeautyBookingPolicy,
  type AdminBeautyBookingPolicy,
} from "../services/adminApi";

const VIP_TIERS = [
  { id: "none", label: "Non-VIP" },
  { id: "silver", label: "Silver" },
  { id: "gold", label: "Gold" },
  { id: "platinum", label: "Platinum" },
] as const;

type TierId = (typeof VIP_TIERS)[number]["id"];

type TierKey =
  | "employer_service_fee_by_tier"
  | "service_sourcing_by_tier"
  | "service_commission_by_tier";

const FLAT_FIELDS: {
  key: keyof AdminBeautyBookingPolicy;
  label: string;
  hint?: string;
  step?: number;
}[] = [
  {
    key: "employer_service_fee_percent",
    label: "ค่าบริการลูกค้า (%) — default",
    hint: "บวกจาก quoted price (ใช้เมื่อไม่กรอก VIP override)",
  },
  {
    key: "service_sourcing_percent",
    label: "ค่าจัดหาช่าง (%) — default",
    hint: "หักจากค่าบริการ",
  },
  {
    key: "service_commission_percent",
    label: "คอมมิชชั่นบริการ (%) — default",
    hint: "หักจากค่าบริการ",
  },
  {
    key: "transport_platform_fee_percent",
    label: "ค่าแพลตฟอร์มค่าเดินทาง (%) — default",
    hint: "หักจาก transport total",
  },
  { key: "transport_base_fare_thb", label: "ค่าแรกเข้าเดินทาง (บาท)", step: 1 },
  { key: "transport_rate_min_km", label: "อัตราต่ำสุด/กม. (บาท)", step: 0.5 },
  { key: "transport_rate_max_km", label: "อัตราสูงสุด/กม. (บาท)", step: 0.5 },
  { key: "min_completion_photos", label: "รูปขั้นต่ำ/phase", step: 1 },
  { key: "payout_withdraw_hold_hours", label: "Hold ถอนเงิน (ชม.)", step: 1 },
  { key: "cancel_notice_hours", label: "แจ้งยกเลิกล่วงหน้า (ชม.)", step: 1 },
  { key: "no_show_fee_percent", label: "หักผิดนัด (% ของยอด)", step: 1 },
  {
    key: "no_show_fee_platform_share",
    label: "ส่วนแพลตฟอร์มจากค่าผิดนัด (%)",
  },
  {
    key: "no_show_fee_provider_share",
    label: "ส่วนช่างจากค่าผิดนัด (%)",
  },
];

const VIP_TABLES: {
  tierKey: TierKey;
  flatKey: keyof AdminBeautyBookingPolicy;
  title: string;
  who: string;
}[] = [
  {
    tierKey: "employer_service_fee_by_tier",
    flatKey: "employer_service_fee_percent",
    title: "ค่าบริการลูกค้า",
    who: "ลูกค้า VIP",
  },
  {
    tierKey: "service_sourcing_by_tier",
    flatKey: "service_sourcing_percent",
    title: "ค่าจัดหาช่าง",
    who: "ช่าง VIP",
  },
  {
    tierKey: "service_commission_by_tier",
    flatKey: "service_commission_percent",
    title: "คอมมิชชั่นบริการ",
    who: "ช่าง VIP",
  },
];

function policyToDraft(p: AdminBeautyBookingPolicy): Record<string, string> {
  const d: Record<string, string> = {};
  for (const { key } of FLAT_FIELDS) {
    const v = p[key];
    if (v != null) d[key] = String(v);
  }
  return d;
}

function tierDraftFromPolicy(
  p: AdminBeautyBookingPolicy,
): Record<TierKey, Record<TierId, string>> {
  const out = {} as Record<TierKey, Record<TierId, string>>;
  for (const { tierKey } of VIP_TABLES) {
    out[tierKey] = { none: "", silver: "", gold: "", platinum: "" };
    const m = p[tierKey];
    if (m && typeof m === "object") {
      for (const t of VIP_TIERS) {
        const v = (m as Record<string, number>)[t.id];
        if (v != null) out[tierKey][t.id] = String(v);
      }
    }
  }
  return out;
}

export type MerchantHubBookingFeesPanelProps = {
  embedded?: boolean;
  onNotice?: (msg: string) => void;
};

export const MerchantHubBookingFeesPanel: React.FC<
  MerchantHubBookingFeesPanelProps
> = ({ embedded, onNotice }) => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [flatDraft, setFlatDraft] = useState<Record<string, string>>({});
  const [tierDraft, setTierDraft] = useState<
    Record<TierKey, Record<TierId, string>>
  >(() => tierDraftFromPolicy({}));
  const [useVipOverrides, setUseVipOverrides] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { policy } = await getAdminBeautyBookingPolicy();
      setFlatDraft(policyToDraft(policy));
      setTierDraft(tierDraftFromPolicy(policy));
      setUseVipOverrides(!!policy.use_vip_tier_overrides);
    } catch (e: unknown) {
      setError((e as { message?: string })?.message || "โหลดนโยบายไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const body: Partial<AdminBeautyBookingPolicy> = {};
      for (const { key } of FLAT_FIELDS) {
        const raw = flatDraft[key];
        if (raw !== undefined && raw !== "") {
          (body as Record<string, number>)[key] = Number(raw);
        }
      }
      for (const { tierKey } of VIP_TABLES) {
        const partial: Record<string, number> = {};
        for (const t of VIP_TIERS) {
          const raw = tierDraft[tierKey]?.[t.id];
          if (raw !== undefined && raw !== "") {
            partial[t.id] = Number(raw);
          }
        }
        if (Object.keys(partial).length) {
          body[tierKey] = partial;
        }
      }
      await patchAdminBeautyBookingPolicy({
        ...body,
        use_vip_tier_overrides: useVipOverrides,
      });
      onNotice?.("บันทึกนโยบาย Merchant Hub แล้ว");
      await load();
    } catch (e: unknown) {
      const msg =
        (e as { message?: string })?.message || "บันทึกนโยบายไม่สำเร็จ";
      setError(msg);
      onNotice?.(msg);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-10">
        <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {!embedded ? (
        <div className="rounded-xl border border-indigo-200 bg-gradient-to-r from-indigo-50 to-white p-5">
          <h3 className="font-bold text-slate-900 flex items-center gap-2 text-lg">
            <Store className="h-5 w-5 text-indigo-600" />
            Merchant Hub Booking — ค่าธรรมเนียม & นโยบาย
          </h3>
          <p className="text-sm text-slate-600 mt-1">
            Barber / Beauty / Chef / Tailor / Artist — อ่านจาก DB ทุกครั้งที่จอง
            และปล่อย payout
          </p>
        </div>
      ) : null}

      {error ? (
        <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
          {error}
        </p>
      ) : null}

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-slate-100 bg-slate-50">
          <h4 className="font-semibold text-slate-800">
            ค่าเริ่มต้น (ทุก tier)
          </h4>
        </div>
        <div className="p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {FLAT_FIELDS.map(({ key, label, hint, step }) => (
            <label key={key} className="text-xs block">
              <span className="font-medium text-slate-700">{label}</span>
              {hint ? (
                <span className="block text-[10px] text-slate-500 mb-1">
                  {hint}
                </span>
              ) : null}
              <input
                type="number"
                step={step ?? 0.1}
                min={0}
                className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
                value={flatDraft[key] ?? ""}
                onChange={(e) =>
                  setFlatDraft((d) => ({ ...d, [key]: e.target.value }))
                }
              />
            </label>
          ))}
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-slate-100 bg-slate-50 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h4 className="font-semibold text-slate-800">Override ตาม VIP</h4>
            <p className="text-xs text-slate-500">
              เปิดเมื่อต้องการให้ tier ด้านล่างมีผล — ปิด = ใช้ค่า default
              เท่านั้น
            </p>
          </div>
          <label className="flex items-center gap-2 text-sm font-medium text-slate-700 cursor-pointer">
            <input
              type="checkbox"
              checked={useVipOverrides}
              onChange={(e) => setUseVipOverrides(e.target.checked)}
              className="rounded border-slate-300"
            />
            ใช้ VIP tier overrides
          </label>
        </div>
        {useVipOverrides ? (
          <div className="p-4 space-y-6 overflow-x-auto">
            {VIP_TABLES.map(({ tierKey, flatKey, title, who }) => (
              <div key={tierKey}>
                <p className="text-sm font-semibold text-slate-800 mb-1">
                  {title}{" "}
                  <span className="font-normal text-slate-500">({who})</span>
                </p>
                <table className="w-full text-sm min-w-[420px]">
                  <thead>
                    <tr className="text-left text-xs text-slate-500">
                      {VIP_TIERS.map((t) => (
                        <th key={t.id} className="pb-2 pr-2 font-medium">
                          {t.label}
                        </th>
                      ))}
                      <th className="pb-2 text-slate-400 font-normal">
                        default: {flatDraft[flatKey] ?? "—"}%
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      {VIP_TIERS.map((t) => (
                        <td key={t.id} className="pr-2 pb-1">
                          <input
                            type="number"
                            min={0}
                            max={100}
                            step={0.5}
                            placeholder="—"
                            className="w-20 px-2 py-1 border border-slate-200 rounded text-center text-sm"
                            value={tierDraft[tierKey]?.[t.id] ?? ""}
                            onChange={(e) =>
                              setTierDraft((d) => ({
                                ...d,
                                [tierKey]: {
                                  ...d[tierKey],
                                  [t.id]: e.target.value,
                                },
                              }))
                            }
                          />
                          <span className="text-xs text-slate-400 ml-0.5">
                            %
                          </span>
                        </td>
                      ))}
                      <td />
                    </tr>
                  </tbody>
                </table>
              </div>
            ))}
          </div>
        ) : (
          <p className="p-4 text-sm text-slate-500">
            ปิดอยู่ — ระบบใช้เฉพาะค่า default ด้านบน (แนะนำสำหรับ production)
          </p>
        )}
      </div>

      <button
        type="button"
        disabled={saving}
        onClick={() => void save()}
        className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
      >
        {saving ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Save className="h-4 w-4" />
        )}
        บันทึกนโยบาย Merchant Hub
      </button>
    </div>
  );
};
