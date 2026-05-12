/**
 * Types + re-export จาก paymentAdapter.js (รันไทม์ใช้ไฟล์ .js ใน Node)
 */
export type PaymentChannelId =
  | 'promptpay'
  | 'truemoney'
  | 'shopeepay'
  | 'stripe'
  | 'wechat'
  | 'alipay'
  | 'card';

export type GatewayTransactionMetadata = {
  meerak_job_id?: string;
  meerak_order_id?: string;
  meerak_user_id?: string;
  payment_channel: PaymentChannelId | string;
  payment_gateway: string;
  idempotency_key?: string;
};

export type PaysoChargeDraft = {
  _schema: string;
  amount_thb: number;
  currency: string;
  payment_method_hint: string;
  merchant_order_ref?: string;
  order_description?: string;
  metadata: Record<string, unknown>;
  callback: { notify_url?: string; return_url?: string };
};

export type KsherChargeDraft = {
  _schema: string;
  total_amount: number;
  currency: string;
  channel: string;
  out_trade_no?: string;
  subject?: string;
  metadata: Record<string, unknown>;
  notify_url?: string;
  return_url?: string;
};

export {
  buildTransactionMetadata,
  buildPaysoChargeRequestDraft,
  buildKsherChargeRequestDraft,
  buildGatewayChargePayload,
  mergeGatewayMetadata,
} from './paymentAdapter.js';
