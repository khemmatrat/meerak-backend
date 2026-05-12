/**
 * สอดคล้อง backend/lib/paymentProviderGate.js — ฝั่ง client อ่าน snapshot จาก GET /api/payments/provider-config
 */
export type LocalGateway = "payso" | "ksher";

export type PaymentProviderGateSnapshot = {
  localGateway: LocalGateway;
  localGatewayLabel: string;
  stripeCardEnabled: boolean;
  matchMarkupRate: number;
  matchMarkupPercent: number;
  mdr: {
    promptpay: { inboundPercent: number; outboundPercent: number };
    truemoney: { inboundPercent: number };
    shopeepay: { inboundPercent: number };
    stripeCard: {
      inboundPercent: number;
      internationalPercent?: number;
      promptPayPercent?: number;
      payoutOutboundPercent: number;
    };
  };
  stripeDetail?: {
    cardDomesticPercent: number;
    cardInternationalPercent: number;
    promptPayPercent: number;
    fixedFeeDomesticThb: number;
    fixedFeeInternationalThb: number;
    refundFeeThb: number;
    fxSurchargePercent: number;
  };
  bestProviderHints?: {
    promptpay?: { kind: string; gateway: string; mdrDecimal: number; compared?: unknown[] };
    truemoney?: { kind: string; gateway: string; mdrDecimal: number; compared?: unknown[] };
    shopeepay?: { kind: string; gateway: string; mdrDecimal: number; compared?: unknown[] };
  };
  referenceRates?: {
    payso: {
      promptpay: { inboundPercent: number };
      truemoney: { inboundPercent: number };
      shopeepay: { inboundPercent: number };
      payoutTransferThb: { min: number; max: number };
      note?: string;
    };
    ksher: {
      promptpay: { inboundPercent: number };
      truemoney: { inboundPercent: number };
      shopeepay: { inboundPercent: number };
      wechat: { inboundPercent: number };
      alipay: { inboundPercent: number };
      card: { juridicalPercent: number; individualPercent: number };
    };
    stripe: {
      cardDomestic: { percent: number; fixedFeeThb: number };
      cardInternational: { percent: number; fixedFeeThb: number };
      promptPay: { inboundPercent: number };
      refundFeeThb: number;
      fxSurchargePercent: number;
    };
  };
};
