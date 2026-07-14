import React, { useCallback, useEffect, useMemo, useState } from "react";

import { useNavigate } from "react-router-dom";

import { Loader2, Shield } from "lucide-react";

import { Layout } from "../components/Layout";

import { PrbStepHeader } from "../components/prb/PrbStepHeader";

import { PrbDocUploadSlot } from "../components/prb/PrbDocUploadSlot";

import { PrbPriceBreakdown } from "../components/prb/PrbPriceBreakdown";

import { PrbSuccessModal } from "../components/prb/PrbSuccessModal";

import { PrbAddressPicker } from "../components/prb/PrbAddressPicker";

import { PrbSearchableSelect } from "../components/prb/PrbSearchableSelect";

import { PrbSummaryAccordion } from "../components/prb/PrbSummaryAccordion";

import {
  prbPageBg,
  prbHeroCard,
  prbSectionCard,
  prbHeading,
  prbCta,
  prbInput,
} from "../components/prb/prbTheme";

import {
  createPrbOrder,
  extractPrbOcr,
  fetchPrbConfig,
  fetchPrbEligibility,
  type PrbCarType,
  type PrbOrderPayload,
} from "../services/prbApi";

import { useNotification } from "../context/NotificationContext";

import { formatPrbPromoBanner, prbMinWalletTopup } from "../utils/prbPromoText";

const PREFIXES = ["คุณ", "นาย", "นาง", "นางสาว"];

const CAR_TYPES: { id: PrbCarType; label: string }[] = [
  { id: "sedan", label: "รถเก๋ง" },

  { id: "pickup", label: "กระบะ" },

  { id: "motorcycle", label: "มอเตอร์ไซค์" },
];

const emptyForm: Partial<PrbOrderPayload> = {
  car_type: "sedan",

  id_type: "บัตรประชาชน",

  name_prefix: "คุณ",

  nationality: "Thailand",
};

export function PrbFlow() {
  const navigate = useNavigate();

  const { notify } = useNotification();

  const [step, setStep] = useState<1 | 2 | 3>(1);

  const [loading, setLoading] = useState(true);

  const [submitting, setSubmitting] = useState(false);

  const [config, setConfig] = useState<Awaited<
    ReturnType<typeof fetchPrbConfig>
  > | null>(null);

  const [eligibility, setEligibility] = useState<Awaited<
    ReturnType<typeof fetchPrbEligibility>
  > | null>(null);

  const [form, setForm] = useState<Partial<PrbOrderPayload>>(emptyForm);

  const [success, setSuccess] = useState<{
    quoteNumber: string;

    orderId: string;
  } | null>(null);

  const reloadConfig = useCallback(async () => {
    try {
      const cfg = await fetchPrbConfig();
      setConfig(cfg);
      return cfg;
    } catch {
      return null;
    }
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const [cfg, elig] = await Promise.all([
          fetchPrbConfig(),

          fetchPrbEligibility(),
        ]);

        setConfig(cfg);

        const promoDiscount =
          elig.has_promo && cfg?.first_order_discount_thb != null
            ? Number(cfg.first_order_discount_thb) || 0
            : elig.promo_discount_thb;

        setEligibility({
          ...elig,

          promo_discount_thb: promoDiscount,
        });

        if (elig.user_profile) {
          const parts = String(elig.user_profile.full_name || "")
            .trim()

            .split(/\s+/);

          setForm((f) => ({
            ...f,

            phone_number: elig.user_profile?.phone || f.phone_number,

            national_id: elig.user_profile?.national_id || f.national_id,

            first_name: parts[0] || f.first_name,

            last_name: parts.slice(1).join(" ") || f.last_name,
          }));
        }
      } catch {
        notify("โหลดข้อมูลไม่สำเร็จ", "error");
      } finally {
        setLoading(false);
      }
    })();
  }, [notify]);

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") reloadConfig();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [reloadConfig]);

  const minTopup = prbMinWalletTopup(config);

  const pricing = useMemo(() => {
    const carType = form.car_type || "sedan";
    const fromServer = config?.pricing_by_car_type?.[carType];

    const base =
      fromServer?.base ??
      (Number.isFinite(Number(config?.base_price_by_car_type?.[carType]))
        ? Number(config?.base_price_by_car_type?.[carType])
        : 645.21);

    const fee =
      fromServer?.fee ??
      (Number.isFinite(Number(config?.platform_fee_by_car_type?.[carType]))
        ? Number(config?.platform_fee_by_car_type?.[carType])
        : 10);

    const discount = eligibility?.has_promo
      ? Number(
          eligibility.promo_discount_thb ??
            config?.first_order_discount_thb ??
            0,
        ) || 0
      : 0;

    return { base, fee, discount, total: Math.max(0, base + fee - discount) };
  }, [config, form.car_type, eligibility]);

  const maxAddr = config?.address_line_max_chars || 15;

  const patch = (p: Partial<PrbOrderPayload>) =>
    setForm((f) => ({ ...f, ...p }));

  const onOcr = async (url: string) => {
    patch({ car_registration_img_url: url });

    try {
      const ocr = await extractPrbOcr(url);

      patch({
        registration_number: String(ocr.registration_number || ""),

        registration_province: String(ocr.registration_province || ""),

        chassis_number: String(ocr.chassis_number || ""),

        chassis_search_7: String(ocr.chassis_search_7 || ""),

        vehicle_brand: String(ocr.vehicle_brand || ""),

        vehicle_model: String(ocr.vehicle_model || ""),

        vehicle_year: Number(ocr.vehicle_year) || undefined,

        registration_year: Number(ocr.registration_year) || undefined,

        engine_cc: Number(ocr.engine_cc) || undefined,

        vehicle_weight_kg: Number(ocr.vehicle_weight_kg) || undefined,

        seat_count: Number(ocr.seat_count) || undefined,

        car_type: (ocr.car_type as PrbCarType) || form.car_type,

        first_name: String(ocr.first_name || form.first_name || ""),

        last_name: String(ocr.last_name || form.last_name || ""),
      });
    } catch {
      notify("อ่านข้อมูลจากรูปไม่สำเร็จ — กรอกเองได้", "warning");
    }
  };

  const validateStep2 = () => {
    if (!form.car_registration_img_url) return "กรุณาอัปโหลดเล่มทะเบียน";

    if (!form.registration_number?.trim()) return "กรุณากรอกทะเบียนรถ";

    if (!form.chassis_number?.trim()) return "กรุณากรอกเลขตัวถัง";

    if (!form.national_id || form.national_id.replace(/\D/g, "").length !== 13)
      return "เลขบัตรประชาชนไม่ถูกต้อง";

    if (
      !form.phone_number ||
      form.phone_number.replace(/\D/g, "").length !== 10
    )
      return "เบอร์โทรไม่ถูกต้อง";

    if (!form.address_line?.trim()) return "กรุณากรอกที่อยู่";

    if ((form.address_line || "").length > maxAddr)
      return `ที่อยู่ต้องไม่เกิน ${maxAddr} ตัวอักษร`;

    if (!form.shipping_address?.trim()) return "กรุณากรอกที่อยู่จัดส่ง";

    return null;
  };

  const handlePay = async () => {
    setSubmitting(true);

    try {
      const result = await createPrbOrder(form as PrbOrderPayload);

      setSuccess({
        quoteNumber: result.order?.quote_number || "PRB",

        orderId: result.order?.id,
      });
    } catch (e: unknown) {
      const msg =
        (e as { response?: { data?: { error?: string } } })?.response?.data
          ?.error || "ชำระเงินไม่สำเร็จ";

      notify(msg, "error");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <Layout>
        <div
          className={`flex min-h-[60vh] items-center justify-center ${prbPageBg}`}
        >
          <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className={`px-4 py-6 pb-24 ${prbPageBg}`}>
        <PrbStepHeader
          step={step}
          title={
            step === 1
              ? "ต่อ พรบ. ออนไลน์"
              : step === 2
                ? "กรอกข้อมูล"
                : "ชำระเงิน"
          }
        />

        {step === 1 ? (
          <div className="space-y-4">
            <div className={`${prbHeroCard} p-5`}>
              <div className="mb-3 flex items-center gap-2">
                <Shield className="h-6 w-6 text-blue-600" />

                <span className={prbHeading}>พ.ร.บ. ผ่าน AQOND</span>
              </div>

              <p className="text-sm text-slate-600">
                {formatPrbPromoBanner(config)}
              </p>
            </div>

            <div className={prbSectionCard}>
              <p className="mb-3 text-sm font-medium text-slate-700">
                ประเภทรถ
              </p>

              <div className="grid grid-cols-3 gap-2">
                {CAR_TYPES.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => {
                      patch({ car_type: c.id });
                      reloadConfig();
                    }}
                    className={`rounded-lg border py-2 text-sm ${
                      form.car_type === c.id
                        ? "border-blue-500 bg-blue-50 text-blue-800"
                        : "border-slate-200"
                    }`}
                  >
                    {c.label}
                  </button>
                ))}
              </div>

              <PrbPriceBreakdown
                base={pricing.base}
                fee={pricing.fee}
                discount={pricing.discount}
                total={pricing.total}
                balance={eligibility?.wallet_balance}
              />
            </div>

            <div className="rounded-lg bg-white p-4 text-sm">
              <span className="text-slate-600">ยอด Wallet: </span>

              <strong>
                ฿{Number(eligibility?.wallet_balance || 0).toLocaleString()}
              </strong>
            </div>

            {!eligibility?.can_enter ? (
              <button
                type="button"
                className={prbCta}
                onClick={() =>
                  navigate(`/wallet/topup?next=/prb&min=${minTopup}`)
                }
              >
                เติมเงิน {minTopup.toLocaleString()} บาท
              </button>
            ) : (
              <button
                type="button"
                className={prbCta}
                onClick={() => setStep(2)}
              >
                เริ่มต่อ พรบ.
              </button>
            )}
          </div>
        ) : null}

        {step === 2 ? (
          <div className="space-y-4">
            <div className={prbSectionCard}>
              <h3 className={`mb-3 ${prbHeading}`}>ข้อมูลรถ</h3>

              <PrbDocUploadSlot
                label="สำเนาเล่มทะเบียนรถ"
                required
                url={form.car_registration_img_url}
                onUploaded={onOcr}
              />

              <div className="mt-3 grid gap-3">
                {[
                  ["registration_number", "ทะเบียนรถ", true],

                  ["registration_province", "จังหวัดทะเบียน", false],

                  ["chassis_number", "เลขตัวถัง", true],

                  ["vehicle_brand", "ยี่ห้อ", false],

                  ["vehicle_model", "รุ่น", false],
                ].map(([key, label, req]) => (
                  <div key={key}>
                    <label className="mb-1 block text-sm text-slate-700">
                      {label as string}

                      {req ? <span className="text-red-500"> *</span> : null}
                    </label>

                    <input
                      className={prbInput}
                      value={String(form[key as keyof PrbOrderPayload] || "")}
                      onChange={(e) =>
                        patch({
                          [key]: e.target.value,
                        } as Partial<PrbOrderPayload>)
                      }
                    />
                  </div>
                ))}

                <div className="grid grid-cols-2 gap-3">
                  {[
                    ["vehicle_year", "ปี"],

                    ["engine_cc", "ซีซี"],

                    ["vehicle_weight_kg", "น้ำหนัก"],

                    ["seat_count", "ที่นั่ง"],
                  ].map(([key, label]) => (
                    <div key={key}>
                      <label className="mb-1 block text-sm text-slate-700">
                        {label}
                      </label>

                      <input
                        className={prbInput}
                        inputMode="numeric"
                        value={String(form[key as keyof PrbOrderPayload] || "")}
                        onChange={(e) =>
                          patch({
                            [key]: e.target.value
                              ? Number(e.target.value)
                              : undefined,
                          } as Partial<PrbOrderPayload>)
                        }
                      />
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className={prbSectionCard}>
              <h3 className={`mb-3 ${prbHeading}`}>หน้ากรมธรรม์</h3>

              <div className="grid gap-3">
                <PrbSearchableSelect
                  label="คำนำหน้า"
                  required
                  value={form.name_prefix || ""}
                  options={PREFIXES}
                  onChange={(v) => patch({ name_prefix: v })}
                />

                {[
                  ["national_id", "เลขบัตรประชาชน"],

                  ["first_name", "ชื่อ"],

                  ["last_name", "นามสกุล"],

                  ["phone_number", "เบอร์โทร"],
                ].map(([key, label]) => (
                  <div key={key}>
                    <label className="mb-1 block text-sm text-slate-700">
                      {label} <span className="text-red-500">*</span>
                    </label>

                    <input
                      className={prbInput}
                      value={String(form[key as keyof PrbOrderPayload] || "")}
                      onChange={(e) =>
                        patch({
                          [key]: e.target.value,
                        } as Partial<PrbOrderPayload>)
                      }
                    />
                  </div>
                ))}

                <div>
                  <label className="mb-1 block text-sm text-slate-700">
                    ที่อยู่ (บ้านเลขที่) <span className="text-red-500">*</span>
                    <span className="ml-2 text-xs text-slate-400">
                      {(form.address_line || "").length}/{maxAddr}
                    </span>
                  </label>

                  <input
                    className={prbInput}
                    maxLength={maxAddr}
                    value={form.address_line || ""}
                    onChange={(e) => patch({ address_line: e.target.value })}
                  />
                </div>

                <PrbAddressPicker
                  province={form.address_province || ""}
                  district={form.address_district || ""}
                  subdistrict={form.address_subdistrict || ""}
                  postalCode={form.postal_code || ""}
                  onChange={(p) =>
                    patch({
                      address_province: p.province ?? form.address_province,

                      address_district: p.district ?? form.address_district,

                      address_subdistrict:
                        p.subdistrict ?? form.address_subdistrict,

                      postal_code: p.postal_code ?? form.postal_code,
                    })
                  }
                />
              </div>
            </div>

            <div className={prbSectionCard}>
              <h3 className={`mb-3 ${prbHeading}`}>เอกสารเพิ่มเติม</h3>

              <div className="space-y-3">
                <PrbDocUploadSlot
                  label="บัตรประชาชน (แนะนำ)"
                  url={form.id_card_img_url}
                  onUploaded={(url) => patch({ id_card_img_url: url })}
                />

                <PrbDocUploadSlot
                  label="เอกสารที่อยู่ (แนะนำ)"
                  url={form.address_proof_img_url}
                  onUploaded={(url) => patch({ address_proof_img_url: url })}
                />
              </div>
            </div>

            <div className={prbSectionCard}>
              <label className="mb-1 block text-sm font-medium text-slate-700">
                ที่อยู่จัดส่งเอกสาร <span className="text-red-500">*</span>
              </label>

              <textarea
                className={`${prbInput} min-h-[80px]`}
                value={form.shipping_address || ""}
                onChange={(e) => patch({ shipping_address: e.target.value })}
              />
            </div>

            <PrbSummaryAccordion form={form} />

            <button
              type="button"
              className={prbCta}
              onClick={() => {
                const err = validateStep2();

                if (err) {
                  notify(err, "error");

                  return;
                }

                setStep(3);
              }}
            >
              ยืนยันข้อมูลและไปชำระเงิน
            </button>
          </div>
        ) : null}

        {step === 3 ? (
          <div className="space-y-4">
            <PrbPriceBreakdown
              base={pricing.base}
              fee={pricing.fee}
              discount={pricing.discount}
              total={pricing.total}
              balance={eligibility?.wallet_balance}
            />

            <button
              type="button"
              className={prbCta}
              disabled={submitting}
              onClick={handlePay}
            >
              {submitting
                ? "กำลังชำระ..."
                : `ชำระเงิน ฿${pricing.total.toLocaleString()}`}
            </button>
          </div>
        ) : null}

        {success ? (
          <PrbSuccessModal
            quoteNumber={success.quoteNumber}
            orderId={success.orderId}
            onClose={() => navigate("/")}
          />
        ) : null}
      </div>
    </Layout>
  );
}
