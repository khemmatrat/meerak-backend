/**
 * PaymentProviderGate — สลับ Payso / Ksher (local QR + wallets) ผ่าน ENV + เก็บ Stripe เป็นช่องบัตร
 * MDR แยกตามค่าย (ขาเข้า/ขาออก) สำหรับ PromptPay / TrueMoney / ShopeePay และบัตร
 *
 * Runtime overrides (PATCH /api/admin/payment-provider-gate) — ไม่ต้องรีสตาร์ท Node;
 * persist ที่ backend/data/payment-provider-gate.runtime.json
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { round2 } from './financialEngine.js';
import { isPaysoEnabledFromEnv, getPaysoEnabledEnvDiagnostics } from './paysoEnvFlag.js';
import {
  normalizePaymentChannel,
  stripeCardInboundMdrDecimal,
  resolvePaysoInboundMdrDecimal,
  resolveKsherInboundMdrDecimal,
  resolveInboundMdrDecimalForGatewayAndChannel,
} from './paymentAdapterRegistry.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const PAYMENT_PROVIDER_GATE_RUNTIME_FILE = path.join(__dirname, '..', 'data', 'payment-provider-gate.runtime.json');

export const LOCAL_GATEWAY_PAYSO = 'payso';
export const LOCAL_GATEWAY_KSHER = 'ksher';

let runtimeLocalGatewayOverride = null;
let runtimeMatchMarkupRateOverride = null;
/** true = แอดมินปิด QR PaySo เติมเงิน (โอนสลิปยังได้) */
let runtimePaysoQrDepositBlocked = false;

function loadRuntimeFromDisk() {
  try {
    if (!fs.existsSync(PAYMENT_PROVIDER_GATE_RUNTIME_FILE)) return;
    const j = JSON.parse(fs.readFileSync(PAYMENT_PROVIDER_GATE_RUNTIME_FILE, 'utf8'));
    if (j.localGateway === LOCAL_GATEWAY_KSHER || j.localGateway === LOCAL_GATEWAY_PAYSO) {
      runtimeLocalGatewayOverride = j.localGateway;
    }
    if (typeof j.matchMarkupRate === 'number' && Number.isFinite(j.matchMarkupRate) && j.matchMarkupRate >= 0 && j.matchMarkupRate <= 0.5) {
      runtimeMatchMarkupRateOverride = j.matchMarkupRate;
    }
    if (j.paysoQrDepositBlocked === true) {
      runtimePaysoQrDepositBlocked = true;
    }
  } catch (e) {
    console.warn('[paymentProviderGate] runtime load:', e?.message || e);
  }
}

function persistRuntimeToDisk() {
  try {
    const dir = path.dirname(PAYMENT_PROVIDER_GATE_RUNTIME_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      PAYMENT_PROVIDER_GATE_RUNTIME_FILE,
      JSON.stringify(
        {
          localGateway: runtimeLocalGatewayOverride,
          matchMarkupRate: runtimeMatchMarkupRateOverride,
          paysoQrDepositBlocked: runtimePaysoQrDepositBlocked,
          updatedAt: new Date().toISOString(),
        },
        null,
        2
      ),
      'utf8'
    );
  } catch (e) {
    console.warn('[paymentProviderGate] runtime persist:', e?.message || e);
  }
}

loadRuntimeFromDisk();

/**
 * READ-only snapshot for payment capability derivation — no INSERT/UPDATE/DELETE, no enqueue.
 * Merges PAYMENT_MAINTENANCE_PROVIDERS (comma / semicolon / whitespace-separated) with optional
 * `maintenanceProviders` (or `providerMaintenance`) in payment-provider-gate.runtime.json if present.
 */
export function getPaymentCapabilityContext() {
  const fromEnv = String(process.env.PAYMENT_MAINTENANCE_PROVIDERS || '')
    .split(/[,;]+/)
    .flatMap((part) => part.split(/\s+/))
    .map((s) => s.toLowerCase().trim())
    .filter(Boolean);
  let fromFile = [];
  try {
    if (fs.existsSync(PAYMENT_PROVIDER_GATE_RUNTIME_FILE)) {
      const j = JSON.parse(fs.readFileSync(PAYMENT_PROVIDER_GATE_RUNTIME_FILE, 'utf8'));
      const raw = j.maintenanceProviders ?? j.providerMaintenance ?? j.providersInMaintenance;
      if (Array.isArray(raw)) {
        fromFile = raw.map((x) => String(x || '').toLowerCase().trim()).filter(Boolean);
      }
    }
  } catch (_) {
    fromFile = [];
  }
  const maintenanceProviders = [...new Set([...fromEnv, ...fromFile])];
  const ksherCapabilityEnabled =
    !(String(process.env.PAYMENT_KSHER_CAPABILITY_ENABLED || '')
      .toLowerCase()
      .trim()
      .match(/^(0|false|off)$/));
  return {
    maintenanceProviders,
    stripeCardEnabled: isStripeCardEnabledFromEnv(),
    paysoEnvEnabled: isPaysoEnabledFromEnv(),
    paysoQrDepositBlocked: isPaysoQrDepositBlockedByAdmin(),
    ksherCapabilityEnabled,
  };
}

/** @returns {'payso'|'ksher'} */
export function getLocalGatewayFromEnv() {
  if (runtimeLocalGatewayOverride === LOCAL_GATEWAY_KSHER || runtimeLocalGatewayOverride === LOCAL_GATEWAY_PAYSO) {
    return runtimeLocalGatewayOverride;
  }
  const v = (process.env.PAYMENT_LOCAL_GATEWAY || LOCAL_GATEWAY_PAYSO).toLowerCase().trim();
  return v === LOCAL_GATEWAY_KSHER ? LOCAL_GATEWAY_KSHER : LOCAL_GATEWAY_PAYSO;
}

/**
 * @param {'payso'|'ksher'|null|undefined} gw — null เคลียร์ override กลับไปใช้ PAYMENT_LOCAL_GATEWAY
 */
export function setRuntimePaymentLocalGatewayOverride(gw) {
  if (gw == null || gw === '') {
    runtimeLocalGatewayOverride = null;
    persistRuntimeToDisk();
    return { ok: true, localGateway: getLocalGatewayFromEnv() };
  }
  const s = String(gw).toLowerCase().trim();
  if (s !== 'ksher' && s !== 'payso') {
    return { ok: false, error: 'localGateway must be payso or ksher' };
  }
  runtimeLocalGatewayOverride = s === 'ksher' ? LOCAL_GATEWAY_KSHER : LOCAL_GATEWAY_PAYSO;
  persistRuntimeToDisk();
  return { ok: true, localGateway: runtimeLocalGatewayOverride };
}

/**
 * @param {number|null|undefined} rateDecimal — เช่น 0.05 สำหรับ 5%; null เคลียร์
 */
export function setRuntimeMatchMarkupRateOverride(rateDecimal) {
  if (rateDecimal == null || rateDecimal === '') {
    runtimeMatchMarkupRateOverride = null;
    persistRuntimeToDisk();
    return { ok: true, matchMarkupRate: getTransportMatchMarkupRate() };
  }
  const n = Number(rateDecimal);
  if (!Number.isFinite(n) || n < 0 || n > 0.5) {
    return { ok: false, error: 'matchMarkupRate must be between 0 and 0.5 (decimal, e.g. 0.05 for 5%)' };
  }
  runtimeMatchMarkupRateOverride = n;
  persistRuntimeToDisk();
  return { ok: true, matchMarkupRate: n };
}

export function isPaysoQrDepositBlockedByAdmin() {
  return !!runtimePaysoQrDepositBlocked;
}

export function setRuntimePaysoQrDepositBlocked(blocked) {
  runtimePaysoQrDepositBlocked = !!blocked;
  persistRuntimeToDisk();
  return { ok: true, paysoQrDepositBlocked: runtimePaysoQrDepositBlocked };
}

export function clearRuntimePaymentProviderOverrides() {
  runtimeLocalGatewayOverride = null;
  runtimeMatchMarkupRateOverride = null;
  runtimePaysoQrDepositBlocked = false;
  try {
    if (fs.existsSync(PAYMENT_PROVIDER_GATE_RUNTIME_FILE)) fs.unlinkSync(PAYMENT_PROVIDER_GATE_RUNTIME_FILE);
  } catch (_) {
    /* ignore */
  }
  return { ok: true };
}

/** เปิดใช้ชำระด้วยบัตรผ่าน Stripe (สำรอง) — ปิดด้วย STRIPE_PAYMENT_ENABLED=0 */
export function isStripeCardEnabledFromEnv() {
  const v = (process.env.STRIPE_PAYMENT_ENABLED ?? '1').toLowerCase().trim();
  return v !== '0' && v !== 'false' && v !== 'off';
}

function readRate(key, fallback) {
  const raw = process.env[key];
  if (raw == null || raw === '') return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 && n <= 1 ? n : fallback;
}

/** ค่าธรรมเนียมคงที่ (บาท) เช่น Stripe +10 บาท/รายการบัตร */
function readBaht(key, fallback) {
  const raw = process.env[key];
  if (raw == null || raw === '') return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 && n <= 1_000_000 ? n : fallback;
}

function pct2(decimal) {
  return Math.round(Number(decimal) * 10000) / 100;
}

/** Stripe domestic inbound via Task 20 registry (delegates parity implementation). */
function stripeCardMdrDecimal() {
  return stripeCardInboundMdrDecimal();
}

export { normalizePaymentChannel };

/**
 * MDR ขาเข้า (ทศนิยม) ตามค่าย + ช่องทางที่ส่งจากหน้าบ้าน
 * @param {'payso'|'ksher'} gateway
 * @param {string|null|undefined} channelRaw
 */
export function getInboundMdrDecimalForGatewayAndChannel(gateway, channelRaw) {
  const gw = gateway === LOCAL_GATEWAY_KSHER ? LOCAL_GATEWAY_KSHER : LOCAL_GATEWAY_PAYSO;
  return resolveInboundMdrDecimalForGatewayAndChannel(gw, channelRaw);
}

/**
 * เปรียบเทียบ Payso vs Ksher สำหรับช่องทางเดียวกัน — คืนค่าที่ MDR ต่ำสุด (ช่อง stripe ใช้เรท Stripe)
 * @param {string|null|undefined} channelRaw
 */
export function getBestProvider(channelRaw) {
  const ch = normalizePaymentChannel(channelRaw);
  if (ch === 'stripe') {
    return {
      kind: 'stripe',
      gateway: 'stripe',
      mdrDecimal: stripeCardMdrDecimal(),
      fixedFeeDomesticThb: readBaht('PAYMENT_STRIPE_CARD_FIXED_FEE_DOMESTIC_THB', 10),
      compared: [],
    };
  }
  const payso = resolvePaysoInboundMdrDecimal(ch);
  const ksher = resolveKsherInboundMdrDecimal(ch);
  const gateway = ksher < payso ? LOCAL_GATEWAY_KSHER : LOCAL_GATEWAY_PAYSO;
  const mdrDecimal = Math.min(payso, ksher);
  return {
    kind: 'local',
    gateway,
    mdrDecimal,
    compared: [
      { gateway: LOCAL_GATEWAY_PAYSO, mdrDecimal: payso },
      { gateway: LOCAL_GATEWAY_KSHER, mdrDecimal: ksher },
    ],
  };
}

/**
 * อัตรา markup ที่ผู้จ้างจ่ายบนงาน Match/Transport (เดิม 5%) — ปรับตามค่ายหรือ PAYMENT_MATCH_MARKUP_RATE
 * @returns {number} เช่น 0.05
 */
export function getTransportMatchMarkupRate() {
  if (runtimeMatchMarkupRateOverride != null && Number.isFinite(runtimeMatchMarkupRateOverride)) {
    return Math.min(0.5, Math.max(0, Number(runtimeMatchMarkupRateOverride)));
  }
  const g = getLocalGatewayFromEnv();
  const global = process.env.PAYMENT_MATCH_MARKUP_RATE;
  if (global != null && global !== '') {
    const n = Number(global);
    if (Number.isFinite(n) && n >= 0 && n <= 0.5) return n;
  }
  if (g === LOCAL_GATEWAY_KSHER) {
    return readRate('PAYMENT_MATCH_MARKUP_RATE_KSHER', 0.05);
  }
  return readRate('PAYMENT_MATCH_MARKUP_RATE_PAYSO', 0.05);
}

/**
 * MDR ฝั่งรับเงินเข้า (acquirer หักจากร้าน) — ทศนิยม
 * อ้างอิง: Ksher PromptPay 0.5% · Payso PromptPay ~1% (ค่าธรรมเนียมในตารางค่าย ยังไม่รวม VAT ของ Payso)
 */
export function getPromptPayMdrInboundDecimal() {
  return getInboundMdrDecimalForGatewayAndChannel(getLocalGatewayFromEnv(), 'promptpay');
}

export function getPromptPayMdrOutboundDecimal() {
  const gw = getLocalGatewayFromEnv();
  if (gw === LOCAL_GATEWAY_KSHER) {
    return readRate('PAYMENT_MDR_KSHER_PROMPTPAY_OUT', 0.01);
  }
  return readRate('PAYMENT_MDR_PAYSO_PROMPTPAY_OUT', 0.015);
}

/** Ksher TrueMoney 2.5% · Payso e-wallet TrueMoney/Alipay/WeChat ~3% */
export function getTrueMoneyMdrInboundDecimal() {
  return getInboundMdrDecimalForGatewayAndChannel(getLocalGatewayFromEnv(), 'truemoney');
}

/** Ksher ShopeePay 3% · Payso ShopeePay ~2.95% */
export function getShopeePayMdrInboundDecimal() {
  return getInboundMdrDecimalForGatewayAndChannel(getLocalGatewayFromEnv(), 'shopeepay');
}

/**
 * Stripe บัตรในประเทศ — default ~3.65% (Stripe Thailand pricing)
 * รองรับ legacy: PAYMENT_MDR_STRIPE_CARD_IN ถ้ายังตั้งอยู่
 */
export function getStripeCardMdrInboundDecimal() {
  return stripeCardMdrDecimal();
}

export function getStripeCardInternationalMdrDecimal() {
  return readRate('PAYMENT_MDR_STRIPE_CARD_INTL_IN', 0.0475);
}

/** Stripe PromptPay (ชำระผ่าน Stripe) ~1.65% */
export function getStripePromptPayMdrInboundDecimal() {
  return readRate('PAYMENT_MDR_STRIPE_PROMPTPAY_IN', 0.0165);
}

export function getStripeCardFixedFeeDomesticThb() {
  return readBaht('PAYMENT_STRIPE_CARD_FIXED_FEE_DOMESTIC_THB', 10);
}

export function getStripeCardFixedFeeIntlThb() {
  return readBaht('PAYMENT_STRIPE_CARD_FIXED_FEE_INTL_THB', 10);
}

export function getStripeRefundFeeThb() {
  return readBaht('PAYMENT_STRIPE_REFUND_FEE_THB', 10);
}

/** ค่าแปลงสกุล (+2% เมื่อมีการแปลงสกุล — ตามเอกสาร Stripe TH) */
export function getStripeFxSurchargeDecimal() {
  return readRate('PAYMENT_STRIPE_FX_SURCHARGE', 0.02);
}

/** ประมาณ % โอน/จ่ายออก (ถ้าใช้ติดตาม ledger เดิม) */
export function getStripePayoutOutboundDecimal() {
  return readRate('PAYMENT_MDR_STRIPE_PAYOUT_OUT', 0.0025);
}

/** Ksher บัตร: นิติบุคคล ~3.2% · บุคคลธรรมดา ~3.5% (ไม่ผ่อน) */
export function getKsherCardJuridicalMdrDecimal() {
  return readRate('PAYMENT_MDR_KSHER_CARD_JURIDICAL_IN', 0.032);
}

export function getKsherCardIndividualMdrDecimal() {
  return readRate('PAYMENT_MDR_KSHER_CARD_INDIVIDUAL_IN', 0.035);
}

export function getKsherWechatMdrInboundDecimal() {
  return readRate('PAYMENT_MDR_KSHER_WECHAT_IN', 0.02);
}

export function getKsherAlipayMdrInboundDecimal() {
  return readRate('PAYMENT_MDR_KSHER_ALIPAY_IN', 0.025);
}

/** Payso โอนออก (ช่วงที่ค่ายแจ้ง) — บาท/รายการ ไม่ใช่ % */
export function getPaysoPayoutTransferFeeMinThb() {
  return readBaht('PAYMENT_PAYSO_PAYOUT_TRANSFER_MIN_THB', 12);
}

export function getPaysoPayoutTransferFeeMaxThb() {
  return readBaht('PAYMENT_PAYSO_PAYOUT_TRANSFER_MAX_THB', 20);
}

/**
 * Employer outflow — เทียบเท่า calcMatchJobEmployerOutflow แต่ใช้อัตรา markup แบบไดนามิก
 */
/** ใช้แทน calcMatchJobEmployerOutflow ทั้งระบบ — markup ตาม PAYMENT_LOCAL_GATEWAY / env */
export function calcMatchJobEmployerOutflowDynamic(jobFee, insuranceAmount) {
  return calcEmployerOutflowWithMarkupRate(jobFee, insuranceAmount, getTransportMatchMarkupRate());
}

export function calcEmployerOutflowWithMarkupRate(jobFee, insuranceAmount, markupRate) {
  const base = round2(Number(jobFee) + Number(insuranceAmount));
  const r = Math.min(0.5, Math.max(0, Number(markupRate) || 0));
  const paymentMarkup = round2(base * r);
  const finalPrice = round2(base * (1 + r));
  return {
    jobFee: Number(jobFee) || 0,
    insuranceAmount: Number(insuranceAmount) || 0,
    paymentMarkup,
    finalPrice,
    base,
    paymentMarkupRate: r,
  };
}

/**
 * อัตราอ้างอิงตามค่าย (อ่านจาก ENV เดียวกัน) — ใช้เปรียบเทียบในแอดมิน โดยไม่ขึ้นกับ PAYMENT_LOCAL_GATEWAY
 */
function buildReferenceRates() {
  return {
    payso: {
      promptpay: { inboundPercent: pct2(readRate('PAYMENT_MDR_PAYSO_PROMPTPAY_IN', 0.01)) },
      truemoney: { inboundPercent: pct2(readRate('PAYMENT_MDR_PAYSO_TRUEMONEY_IN', 0.03)) },
      shopeepay: { inboundPercent: pct2(readRate('PAYMENT_MDR_PAYSO_SHOPEEPAY_IN', 0.0295)) },
      payoutTransferThb: {
        min: getPaysoPayoutTransferFeeMinThb(),
        max: getPaysoPayoutTransferFeeMaxThb(),
      },
      note: 'ตาราง Payso มักระบุค่าธรรมเนียมก่อน VAT 7% — ตรวจสอบกับสัญญาล่าสุด',
    },
    ksher: {
      promptpay: { inboundPercent: pct2(readRate('PAYMENT_MDR_KSHER_PROMPTPAY_IN', 0.005)) },
      truemoney: { inboundPercent: pct2(readRate('PAYMENT_MDR_KSHER_TRUEMONEY_IN', 0.025)) },
      shopeepay: { inboundPercent: pct2(readRate('PAYMENT_MDR_KSHER_SHOPEEPAY_IN', 0.03)) },
      wechat: { inboundPercent: pct2(readRate('PAYMENT_MDR_KSHER_WECHAT_IN', 0.02)) },
      alipay: { inboundPercent: pct2(readRate('PAYMENT_MDR_KSHER_ALIPAY_IN', 0.025)) },
      card: {
        juridicalPercent: pct2(readRate('PAYMENT_MDR_KSHER_CARD_JURIDICAL_IN', 0.032)),
        individualPercent: pct2(readRate('PAYMENT_MDR_KSHER_CARD_INDIVIDUAL_IN', 0.035)),
      },
    },
    stripe: {
      cardDomestic: {
        percent: pct2(getStripeCardMdrInboundDecimal()),
        fixedFeeThb: getStripeCardFixedFeeDomesticThb(),
      },
      cardInternational: {
        percent: pct2(getStripeCardInternationalMdrDecimal()),
        fixedFeeThb: getStripeCardFixedFeeIntlThb(),
      },
      promptPay: { inboundPercent: pct2(getStripePromptPayMdrInboundDecimal()) },
      refundFeeThb: getStripeRefundFeeThb(),
      fxSurchargePercent: pct2(getStripeFxSurchargeDecimal()),
    },
  };
}

/** สรุปสำหรับ API / แอดมิน */
export function getPaymentProviderGateSnapshot() {
  const g = getLocalGatewayFromEnv();
  const stripeDomesticPct = pct2(getStripeCardMdrInboundDecimal());
  const paysoEnvDiagnostics = getPaysoEnabledEnvDiagnostics();
  const paysoEnvOn = paysoEnvDiagnostics.effectiveOn;
  const blocked = !!runtimePaysoQrDepositBlocked;
  return {
    localGateway: g,
    localGatewayLabel: g === LOCAL_GATEWAY_KSHER ? 'Ksher' : 'Payso',
    paysoEnvEnabled: paysoEnvOn,
    paysoEnvDiagnostics,
    paysoQrDepositBlockedByAdmin: blocked,
    /** PaySo QR เติมเงิน: ต้องเปิด ENV และไม่ถูกแอดมินปิด */
    paysoQrWalletTopupEnabled: paysoEnvOn && !blocked,
    runtime: {
      localGatewayOverride: runtimeLocalGatewayOverride,
      matchMarkupRateOverride: runtimeMatchMarkupRateOverride,
      paysoQrDepositBlocked: blocked,
      matchMarkupPercentOverride:
        runtimeMatchMarkupRateOverride != null
          ? Math.round(runtimeMatchMarkupRateOverride * 10000) / 100
          : null,
      persistedPath: PAYMENT_PROVIDER_GATE_RUNTIME_FILE,
      persisted: fs.existsSync(PAYMENT_PROVIDER_GATE_RUNTIME_FILE),
    },
    stripeCardEnabled: isStripeCardEnabledFromEnv(),
    matchMarkupRate: getTransportMatchMarkupRate(),
    matchMarkupPercent: Math.round(getTransportMatchMarkupRate() * 10000) / 100,
    mdr: {
      promptpay: {
        inboundPercent: pct2(getPromptPayMdrInboundDecimal()),
        outboundPercent: pct2(getPromptPayMdrOutboundDecimal()),
      },
      truemoney: {
        inboundPercent: pct2(getTrueMoneyMdrInboundDecimal()),
      },
      shopeepay: {
        inboundPercent: pct2(getShopeePayMdrInboundDecimal()),
      },
      stripeCard: {
        /** ใช้บัตรในประเทศเป็นค่าเริ่มต้น (มี +บาทต่อรายการใน stripeDetail) */
        inboundPercent: stripeDomesticPct,
        internationalPercent: pct2(getStripeCardInternationalMdrDecimal()),
        promptPayPercent: pct2(getStripePromptPayMdrInboundDecimal()),
        payoutOutboundPercent: pct2(getStripePayoutOutboundDecimal()),
      },
    },
    stripeDetail: {
      cardDomesticPercent: stripeDomesticPct,
      cardInternationalPercent: pct2(getStripeCardInternationalMdrDecimal()),
      promptPayPercent: pct2(getStripePromptPayMdrInboundDecimal()),
      fixedFeeDomesticThb: getStripeCardFixedFeeDomesticThb(),
      fixedFeeInternationalThb: getStripeCardFixedFeeIntlThb(),
      refundFeeThb: getStripeRefundFeeThb(),
      fxSurchargePercent: pct2(getStripeFxSurchargeDecimal()),
    },
    referenceRates: buildReferenceRates(),
    bestProviderHints: {
      promptpay: getBestProvider('promptpay'),
      truemoney: getBestProvider('truemoney'),
      shopeepay: getBestProvider('shopeepay'),
    },
  };
}
