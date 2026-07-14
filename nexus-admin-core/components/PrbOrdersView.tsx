import React, { useCallback, useEffect, useState } from "react";
import {
  Copy,
  Download,
  ExternalLink,
  Loader2,
  RefreshCw,
  Save,
  Settings,
  Shield,
  X,
} from "lucide-react";
import {
  getAdminPrbConfig,
  getAdminPrbFairdeePayload,
  getAdminPrbOrders,
  patchAdminPrbConfig,
  patchAdminPrbOrder,
  postAdminPrbBotStatus,
  type AdminPrbModuleConfig,
  type AdminPrbOrderRow,
} from "../services/adminApi";

const CAR_TYPE_LABELS: Record<string, string> = {
  sedan: "รถเก๋ง",
  pickup: "กระบะ",
  motorcycle: "มอเตอร์ไซค์",
};

const EXCLUDED = ["iCare", "ไทยไพบูลย์", "วิริยะ", "Thai Paiboon", "Viriyah"];

function CopyField({ label, value }: { label: string; value: string }) {
  const v = value || "-";
  return (
    <div className="flex items-start justify-between gap-2 border-b border-slate-100 py-2 text-sm">
      <span className="text-slate-500 shrink-0">{label}</span>
      <div className="flex items-center gap-1 text-right">
        <span className="font-mono text-xs break-all">{v}</span>
        {v !== "-" ? (
          <button
            type="button"
            className="text-blue-600"
            onClick={() => navigator.clipboard.writeText(v)}
            title="คัดลอก"
          >
            <Copy className="h-3.5 w-3.5" />
          </button>
        ) : null}
      </div>
    </div>
  );
}

function buildTsv(order: AdminPrbOrderRow): string {
  const rows: [string, string][] = [
    ["ทะเบียน", order.registration_number || ""],
    ["จังหวัดทะเบียน", order.registration_province || ""],
    ["เลขตัวถัง", order.chassis_number || ""],
    ["เลขตัวถัง 7 หลัก", order.chassis_search_7 || ""],
    ["ยี่ห้อ", order.vehicle_brand || ""],
    ["รุ่น", order.vehicle_model || ""],
    ["ปี", String(order.vehicle_year || "")],
    ["ซีซี", String(order.engine_cc || "")],
    ["น้ำหนัก", String(order.vehicle_weight_kg || "")],
    ["ที่นั่ง", String(order.seat_count || "")],
    ["เลขบัตร", order.national_id || ""],
    ["คำนำหน้า", order.name_prefix || ""],
    ["ชื่อ", order.first_name || ""],
    ["นามสกุล", order.last_name || ""],
    ["โทร", order.phone_number || ""],
    ["ที่อยู่", order.address_line || ""],
    ["จังหวัด", order.address_province || ""],
    ["เขต", order.address_district || ""],
    ["แขวง", order.address_subdistrict || ""],
    ["รหัสไปรษณีย์", order.postal_code || ""],
  ];
  return rows.map(([k, v]) => `${k}\t${v}`).join("\n");
}

export const PrbOrdersView: React.FC = () => {
  const [tab, setTab] = useState<
    "all" | "pending_bot" | "disputes" | "shipped"
  >("all");
  const [rows, setRows] = useState<AdminPrbOrderRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<AdminPrbOrderRow | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [prbConfig, setPrbConfig] = useState<AdminPrbModuleConfig | null>(null);
  const [feeDraft, setFeeDraft] = useState<Record<string, string>>({});
  const [basePriceDraft, setBasePriceDraft] = useState<Record<string, string>>(
    {},
  );
  const [discountDraft, setDiscountDraft] = useState("");
  const [configLoading, setConfigLoading] = useState(true);
  const [configSaving, setConfigSaving] = useState(false);
  const [showSettings, setShowSettings] = useState(true);

  const loadConfig = useCallback(async () => {
    setConfigLoading(true);
    try {
      const { config } = await getAdminPrbConfig();
      setPrbConfig(config);
      setFeeDraft(
        Object.fromEntries(
          ["sedan", "pickup", "motorcycle"].map((k) => [
            k,
            String(config.platform_fee_by_car_type?.[k] ?? ""),
          ]),
        ),
      );
      setBasePriceDraft(
        Object.fromEntries(
          ["sedan", "pickup", "motorcycle"].map((k) => [
            k,
            String(config.base_price_by_car_type?.[k] ?? ""),
          ]),
        ),
      );
      setDiscountDraft(String(config.first_order_discount_thb ?? ""));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setConfigLoading(false);
    }
  }, []);

  const saveFees = async () => {
    setConfigSaving(true);
    setNotice(null);
    setError(null);
    try {
      for (const k of ["sedan", "pickup", "motorcycle"] as const) {
        const base = Number(basePriceDraft[k]);
        if (!Number.isFinite(base) || base <= 0) {
          throw new Error(
            `กรุณาระบุเบี้ย พ.ร.บ. ${CAR_TYPE_LABELS[k]} ให้ถูกต้อง`,
          );
        }
      }
      const platform_fee_by_car_type = Object.fromEntries(
        ["sedan", "pickup", "motorcycle"].map((k) => [k, Number(feeDraft[k])]),
      );
      const base_price_by_car_type = Object.fromEntries(
        ["sedan", "pickup", "motorcycle"].map((k) => [
          k,
          Number(basePriceDraft[k]),
        ]),
      );
      const { config } = await patchAdminPrbConfig({
        platform_fee_by_car_type,
        base_price_by_car_type,
        first_order_discount_thb: Number(discountDraft),
      });
      setPrbConfig(config);
      setFeeDraft(
        Object.fromEntries(
          ["sedan", "pickup", "motorcycle"].map((k) => [
            k,
            String(config.platform_fee_by_car_type?.[k] ?? ""),
          ]),
        ),
      );
      setBasePriceDraft(
        Object.fromEntries(
          ["sedan", "pickup", "motorcycle"].map((k) => [
            k,
            String(config.base_price_by_car_type?.[k] ?? ""),
          ]),
        ),
      );
      setDiscountDraft(String(config.first_order_discount_thb ?? ""));
      setNotice(
        "บันทึกราคาแล้ว — แอปมือถือจะแสดงเบี้ย พ.ร.บ. ค่าบริการ และส่วนลดใหม่เมื่อเปิดหน้าต่อ พ.ร.บ.",
      );
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setConfigSaving(false);
    }
  };

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { orders } = await getAdminPrbOrders({
        tab: tab === "all" ? undefined : tab,
      });
      setRows(orders || []);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [tab]);

  useEffect(() => {
    load();
    loadConfig();
  }, [load, loadConfig]);

  const savePatch = async (patch: Partial<AdminPrbOrderRow>) => {
    if (!selected) return;
    setBusy(true);
    try {
      const { order } = await patchAdminPrbOrder(selected.id, patch);
      setSelected(order);
      setRows((prev) => prev.map((r) => (r.id === order.id ? order : r)));
      setNotice("บันทึกแล้ว");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const copyJson = async () => {
    if (!selected) return;
    const { payload } = await getAdminPrbFairdeePayload(selected.id);
    await navigator.clipboard.writeText(JSON.stringify(payload, null, 2));
    setNotice("คัดลอก JSON แล้ว");
  };

  const downloadJson = async () => {
    if (!selected) return;
    const { payload } = await getAdminPrbFairdeePayload(selected.id);
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: "application/json",
    });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `fairdee-${selected.quote_number || selected.id}.json`;
    a.click();
  };

  const excludedWarning =
    selected?.provider_name &&
    EXCLUDED.some((x) =>
      String(selected.provider_name).toLowerCase().includes(x.toLowerCase()),
    );

  return (
    <div className="flex h-full flex-col overflow-hidden bg-slate-50">
      <div className="border-b border-slate-200 bg-white px-6 py-4">
        <div className="flex items-center gap-3">
          <Shield className="h-6 w-6 text-blue-600" />
          <div>
            <h1 className="text-xl font-bold text-slate-900">
              PRB Orders (FairDee)
            </h1>
            <p className="text-sm text-slate-500">
              คัดลอกข้อมูลไปกรอก agent.fairdee.co.th หรือส่งให้ bot
            </p>
          </div>
          <button
            type="button"
            onClick={load}
            className="ml-auto flex items-center gap-1 rounded-lg border px-3 py-1.5 text-sm"
          >
            <RefreshCw className="h-4 w-4" /> รีเฟรช
          </button>
        </div>
        <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
          <button
            type="button"
            onClick={() => setShowSettings((v) => !v)}
            className="flex w-full items-center gap-2 text-left text-sm font-semibold text-slate-800"
          >
            <Settings className="h-4 w-4 text-blue-600" />
            ตั้งค่าราคา (แสดงบนแอปมือถือ)
            <span className="ml-auto text-xs font-normal text-slate-500">
              {showSettings ? "ซ่อน" : "แสดง"}
            </span>
          </button>
          {showSettings ? (
            configLoading ? (
              <div className="mt-3 flex justify-center py-2">
                <Loader2 className="h-5 w-5 animate-spin text-blue-600" />
              </div>
            ) : (
              <div className="mt-3">
                <p className="mb-3 text-xs text-slate-500">
                  ตั้งเบี้ย พ.ร.บ. และค่าบริการตามราคาจริง — แสดงใน
                  &quot;สรุปค่าใช้จ่าย&quot; บนหน้าต่อ พ.ร.บ. ออนไลน์
                  ส่วนลดใช้กับลูกค้าที่มีสิทธิ์โปรครั้งแรก
                  (เติมเงินครบตามเงื่อนไข)
                </p>
                <label className="mb-4 block max-w-xs rounded-lg border border-slate-200 bg-white p-3 text-sm">
                  <span className="font-medium text-slate-700">
                    ส่วนลดครั้งแรก (บาท)
                  </span>
                  <div className="mt-2 flex items-center gap-2">
                    <span className="text-slate-500">-฿</span>
                    <input
                      type="number"
                      min={0}
                      step={1}
                      className="w-full rounded-md border border-slate-200 px-2 py-1.5 font-mono"
                      value={discountDraft}
                      onChange={(e) => setDiscountDraft(e.target.value)}
                    />
                  </div>
                  <p className="mt-2 text-xs text-slate-500">
                    ตัวอย่างรถเก๋ง: ฿
                    {(Number(basePriceDraft.sedan) || 0).toLocaleString()} + ฿
                    {Number(feeDraft.sedan) || 0} − ฿
                    {Number(discountDraft) || 0} = ฿
                    {Math.max(
                      0,
                      (Number(basePriceDraft.sedan) || 0) +
                        (Number(feeDraft.sedan) || 0) -
                        (Number(discountDraft) || 0),
                    ).toLocaleString()}
                  </p>
                  <p className="mt-2 rounded-md bg-sky-50 px-2 py-1.5 text-xs text-sky-900">
                    ข้อความ banner บนแอป: เติมเงิน{" "}
                    {(
                      Number(prbConfig?.min_wallet_for_entry_thb) || 700
                    ).toLocaleString()}{" "}
                    บาท รับส่วนลด{" "}
                    {(Number(discountDraft) || 0).toLocaleString()} บาท
                    สำหรับต่อ พ.ร.บ. ครั้งแรก
                  </p>
                </label>
                <p className="mb-2 text-xs font-medium text-slate-600">
                  เบี้ย พ.ร.บ. และค่าบริการตามประเภทรถ
                </p>
                <div className="grid gap-3 sm:grid-cols-3">
                  {(["sedan", "pickup", "motorcycle"] as const).map(
                    (carType) => {
                      const base = Number(basePriceDraft[carType]) || 0;
                      const fee = Number(feeDraft[carType]) || 0;
                      return (
                        <div
                          key={carType}
                          className="rounded-lg border border-slate-200 bg-white p-3 text-sm"
                        >
                          <span className="font-medium text-slate-700">
                            {CAR_TYPE_LABELS[carType]}
                          </span>
                          <label className="mt-2 block">
                            <span className="text-xs text-slate-500">
                              เบี้ย พ.ร.บ. (บาท)
                            </span>
                            <div className="mt-1 flex items-center gap-2">
                              <span className="text-slate-500">฿</span>
                              <input
                                type="number"
                                min={0}
                                step={0.01}
                                className="w-full rounded-md border border-slate-200 px-2 py-1.5 font-mono"
                                value={basePriceDraft[carType] ?? ""}
                                onChange={(e) =>
                                  setBasePriceDraft((prev) => ({
                                    ...prev,
                                    [carType]: e.target.value,
                                  }))
                                }
                              />
                            </div>
                          </label>
                          <label className="mt-2 block">
                            <span className="text-xs text-slate-500">
                              ค่าบริการ (บาท)
                            </span>
                            <div className="mt-1 flex items-center gap-2">
                              <span className="text-slate-500">฿</span>
                              <input
                                type="number"
                                min={0}
                                step={1}
                                className="w-full rounded-md border border-slate-200 px-2 py-1.5 font-mono"
                                value={feeDraft[carType] ?? ""}
                                onChange={(e) =>
                                  setFeeDraft((prev) => ({
                                    ...prev,
                                    [carType]: e.target.value,
                                  }))
                                }
                              />
                            </div>
                          </label>
                          <p className="mt-2 text-xs font-medium text-slate-600">
                            รวมก่อนส่วนลด: ฿
                            {(base + fee).toLocaleString(undefined, {
                              maximumFractionDigits: 2,
                            })}
                          </p>
                          {prbConfig?.pricing_by_car_type?.[carType] ? (
                            <p className="mt-1 text-xs text-emerald-700">
                              แอปมือถือจะแสดง: เบี้ย ฿
                              {prbConfig.pricing_by_car_type[
                                carType
                              ].base.toLocaleString(undefined, {
                                maximumFractionDigits: 2,
                              })}{" "}
                              + ค่าบริการ ฿
                              {prbConfig.pricing_by_car_type[
                                carType
                              ].fee.toLocaleString()}
                            </p>
                          ) : null}
                        </div>
                      );
                    },
                  )}
                </div>
                <button
                  type="button"
                  disabled={configSaving}
                  onClick={saveFees}
                  className="mt-3 flex items-center gap-1 rounded-lg bg-emerald-600 px-4 py-2 text-sm text-white disabled:opacity-60"
                >
                  {configSaving ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Save className="h-4 w-4" />
                  )}
                  บันทึกราคา
                </button>
              </div>
            )
          ) : null}
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          {(
            [
              ["all", "ทั้งหมด"],
              ["pending_bot", "รอ Bot"],
              ["shipped", "จัดส่งแล้ว"],
              ["disputes", "พิพาท"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              className={`rounded-full px-3 py-1 text-sm ${
                tab === id
                  ? "bg-blue-600 text-white"
                  : "bg-slate-100 text-slate-700"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        <div className="w-full max-w-xl overflow-auto border-r border-slate-200 bg-white">
          {loading ? (
            <div className="flex justify-center p-8">
              <Loader2 className="h-6 w-6 animate-spin text-blue-600" />
            </div>
          ) : error ? (
            <p className="p-4 text-red-600">{error}</p>
          ) : rows.length === 0 ? (
            <p className="p-4 text-slate-500">ไม่มีรายการ</p>
          ) : (
            rows.map((r) => (
              <button
                key={r.id}
                type="button"
                onClick={() => setSelected(r)}
                className={`block w-full border-b border-slate-100 px-4 py-3 text-left hover:bg-sky-50 ${
                  selected?.id === r.id ? "bg-sky-50" : ""
                }`}
              >
                <div className="font-mono text-sm font-semibold text-blue-800">
                  {r.quote_number}
                </div>
                <div className="text-sm">
                  {r.first_name} {r.last_name} — {r.registration_number}
                </div>
                <div className="mt-1 flex gap-2 text-xs text-slate-500">
                  <span>{r.status}</span>
                  <span>bot: {r.fairdee_bot_status}</span>
                  <span>฿{Number(r.total_price || 0).toLocaleString()}</span>
                </div>
              </button>
            ))
          )}
        </div>

        {selected ? (
          <div className="flex-1 overflow-auto p-4">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-lg font-bold">{selected.quote_number}</h2>
              <button type="button" onClick={() => setSelected(null)}>
                <X className="h-5 w-5 text-slate-400" />
              </button>
            </div>
            {notice ? (
              <p className="mb-2 text-sm text-emerald-600">{notice}</p>
            ) : null}
            {excludedWarning ? (
              <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                บริษัทนี้อยู่ในรายการยกเว้น (iCare / ไทยไพบูลย์ / วิริยะ) —
                อาจต้องกรอกมือ
              </div>
            ) : null}

            <div className="mb-4 flex flex-wrap gap-2">
              <button
                type="button"
                className="flex items-center gap-1 rounded-lg bg-blue-600 px-3 py-2 text-sm text-white"
                onClick={copyJson}
              >
                <Copy className="h-4 w-4" /> Copy JSON
              </button>
              <button
                type="button"
                className="flex items-center gap-1 rounded-lg border px-3 py-2 text-sm"
                onClick={downloadJson}
              >
                <Download className="h-4 w-4" /> Download JSON
              </button>
              <button
                type="button"
                className="flex items-center gap-1 rounded-lg border px-3 py-2 text-sm"
                onClick={() => {
                  navigator.clipboard.writeText(buildTsv(selected));
                  setNotice("คัดลอก TSV แล้ว");
                }}
              >
                <Copy className="h-4 w-4" /> Copy TSV
              </button>
              <a
                href="https://agent.fairdee.co.th"
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-1 rounded-lg border px-3 py-2 text-sm text-blue-700"
              >
                <ExternalLink className="h-4 w-4" /> FairDee Portal
              </a>
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <section className="rounded-xl border bg-white p-4">
                <h3 className="mb-2 font-semibold">ข้อมูลรถ</h3>
                <CopyField
                  label="ทะเบียน"
                  value={selected.registration_number || ""}
                />
                <CopyField
                  label="จังหวัดทะเบียน"
                  value={selected.registration_province || ""}
                />
                <CopyField
                  label="เลขตัวถัง"
                  value={selected.chassis_number || ""}
                />
                <CopyField
                  label="7 หลัก"
                  value={selected.chassis_search_7 || ""}
                />
                <CopyField
                  label="ยี่ห้อ/รุ่น"
                  value={`${selected.vehicle_brand || ""} ${selected.vehicle_model || ""}`}
                />
                <CopyField
                  label="ซีซี"
                  value={String(selected.engine_cc || "")}
                />
                <CopyField
                  label="น้ำหนัก"
                  value={String(selected.vehicle_weight_kg || "")}
                />
                <CopyField
                  label="ที่นั่ง"
                  value={String(selected.seat_count || "")}
                />
                {selected.car_registration_img_url ? (
                  <a
                    href={selected.car_registration_img_url}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-2 inline-block text-sm text-blue-600"
                  >
                    เปิดรูปเล่มทะเบียน
                  </a>
                ) : null}
              </section>

              <section className="rounded-xl border bg-white p-4">
                <h3 className="mb-2 font-semibold">หน้ากรมธรรม์</h3>
                <CopyField label="เลขบัตร" value={selected.national_id || ""} />
                <CopyField
                  label="ชื่อ"
                  value={`${selected.name_prefix || ""} ${selected.first_name || ""} ${selected.last_name || ""}`}
                />
                <CopyField label="โทร" value={selected.phone_number || ""} />
                <CopyField
                  label="ที่อยู่"
                  value={selected.address_line || ""}
                />
                <CopyField
                  label="จังหวัด"
                  value={selected.address_province || ""}
                />
                <CopyField
                  label="เขต"
                  value={selected.address_district || ""}
                />
                <CopyField
                  label="แขวง"
                  value={selected.address_subdistrict || ""}
                />
                <CopyField
                  label="รหัสไปรษณีย์"
                  value={selected.postal_code || ""}
                />
                <CopyField
                  label="จัดส่ง"
                  value={selected.shipping_address || ""}
                />
              </section>

              <section className="rounded-xl border bg-white p-4 lg:col-span-2">
                <h3 className="mb-2 font-semibold">FairDee Ops</h3>
                <div className="grid gap-3 sm:grid-cols-2">
                  {(
                    [
                      ["fairdee_quote_number", "เลขใบเสนอราคา FairDee"],
                      ["provider_code", "รหัสบริษัท"],
                      ["provider_name", "ชื่อบริษัท"],
                      ["vehicle_code", "รหัสรถ"],
                      ["base_premium", "เบี้ยสุทธิ"],
                      ["vat_amount", "VAT"],
                      ["stamp_duty", "อากร"],
                      ["total_premium", "เบี้ยรวม"],
                      ["policy_pdf_url", "Policy PDF URL"],
                    ] as const
                  ).map(([key, label]) => (
                    <label key={key} className="text-sm">
                      <span className="text-slate-500">{label}</span>
                      <input
                        className="mt-1 w-full rounded border px-2 py-1.5 font-mono text-xs"
                        defaultValue={String(selected[key] ?? "")}
                        onBlur={(e) => {
                          const v = e.target.value.trim();
                          if (String(selected[key] ?? "") !== v) {
                            savePatch({
                              [key]: v || null,
                            } as Partial<AdminPrbOrderRow>);
                          }
                        }}
                      />
                    </label>
                  ))}
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {(["processing", "shipped", "completed"] as const).map(
                    (st) => (
                      <button
                        key={st}
                        type="button"
                        disabled={busy}
                        className="rounded-lg border px-3 py-1.5 text-sm"
                        onClick={() => savePatch({ status: st })}
                      >
                        → {st}
                      </button>
                    ),
                  )}
                </div>
                <div className="mt-3 flex items-center gap-2">
                  <span className="text-sm text-slate-500">Bot status</span>
                  <select
                    className="rounded border px-2 py-1 text-sm"
                    value={selected.fairdee_bot_status || "pending"}
                    onChange={(e) =>
                      postAdminPrbBotStatus(selected.id, {
                        status: e.target.value,
                      }).then(({ order }) => {
                        setSelected(order);
                        setNotice("อัปเดต bot status");
                      })
                    }
                  >
                    <option value="pending">pending</option>
                    <option value="submitted">submitted</option>
                    <option value="done">done</option>
                    <option value="failed">failed</option>
                  </select>
                </div>
                <textarea
                  className="mt-2 w-full rounded border p-2 text-sm"
                  placeholder="admin notes"
                  defaultValue={selected.admin_notes || ""}
                  onBlur={(e) => {
                    if (e.target.value !== (selected.admin_notes || "")) {
                      savePatch({ admin_notes: e.target.value });
                    }
                  }}
                />
              </section>
            </div>
          </div>
        ) : (
          <div className="flex flex-1 items-center justify-center text-slate-400">
            เลือกรายการเพื่อดูรายละเอียด FairDee
          </div>
        )}
      </div>
    </div>
  );
};
