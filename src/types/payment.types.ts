// src/types/payment.types.ts - Cost-optimized: PromptPay 3-5 THB vs high-cost 19-25 THB
export const PROCESSING_FEE_THB = 4;

export enum PaymentGateway {
  PROMPTPAY = "promptpay",
  STRIPE = "stripe",
  TRUEMONEY = "truemoney",
}

export enum PaymentStatus {
  PENDING = "pending",
  PROCESSING = "processing",
  COMPLETED = "completed",
  FAILED = "failed",
  EXPIRED = "expired",
  CANCELLED = "cancelled",
  REFUNDED = "refunded",
}

// PromptPay Payment Types
export interface PromptPayPayment {
  payment_id: string;
  qr_code_url: string;
  qr_code_data: string;
  amount: number;
  ref1: string;
  ref2: string;
  expires_at: string;
  status: PaymentStatus;
  gateway_payment_id?: string;
  created_at: string;
}

export interface PromptPayCreateRequest {
  amount: number;
  job_id: string;
  user_id: string;
  bill_no: string;
  transaction_no: string;
  metadata?: Record<string, any>;
}

// Stripe Payment Types
export interface StripePayment {
  payment_intent_id: string;
  client_secret: string;
  amount: number;
  currency: "thb";
  status: PaymentStatus;
  card_last4?: string;
  card_brand?: string;
  receipt_url?: string;
  created_at: string;
}

export interface StripeCreateRequest {
  amount: number;
  job_id: string;
  user_id: string;
  bill_no: string;
  transaction_no: string;
  metadata?: Record<string, any>;
}

// TrueMoney Wallet Types
export interface TrueMoneyPayment {
  payment_id: string;
  deep_link: string;
  qr_code_url: string;
  amount: number;
  status: PaymentStatus;
  expires_at: string;
  created_at: string;
}

export interface TrueMoneyCreateRequest {
  amount: number;
  order_id: string;
  user_id: string;
  callback_url: string;
  metadata?: Record<string, any>;
}

// Generic Payment Request (gateway optional; defaults to PROMPTPAY for 3-5 THB fee)
export interface PaymentRequest {
  job_id: string;
  amount: number;
  gateway?: PaymentGateway;
  metadata?: {
    user_id: string;
    user_name: string;
    job_title: string;
    [key: string]: any;
  };
}

// Generic Payment Response
export interface PaymentResponse {
  success: boolean;
  payment_id: string;
  gateway: PaymentGateway;
  status: PaymentStatus;
  qr_code_url?: string;
  qr_code_data?: string;
  deep_link?: string;
  client_secret?: string;
  amount: number;
  currency: string;
  expires_at?: string;
  bill_no: string;
  transaction_no: string;
  error?: string;
  error_code?: string;
  created_at: string;
}

// Webhook Event Types
export interface WebhookEvent {
  id: string;
  provider: PaymentGateway;
  event_type: string;
  payload: any;
  signature: string;
  timestamp: number;
  processed: boolean;
  processed_at?: string;
  created_at: string;
}

// Payment Status Check
export interface PaymentStatusResponse {
  payment_id: string;
  gateway: PaymentGateway;
  status: PaymentStatus;
  amount: number;
  paid_at?: string;
  failed_reason?: string;
  refunded_at?: string;
  refund_amount?: number;
}

// Refund Request
export interface RefundRequest {
  payment_id: string;
  amount?: number;
  reason: string;
  refunded_by: string;
}

export interface RefundResponse {
  success: boolean;
  refund_id: string;
  payment_id: string;
  amount: number;
  status: "pending" | "completed" | "failed";
  error?: string;
}
