/** AQOND Receipt Core — shared platform types (not vertical-specific). */

export type ReceiptTypeId =
  | 'ENGINE_PREVIEW'
  | 'R001'
  | 'R002'
  | 'R003'
  | 'R004'
  | 'R005'
  | 'R006'
  | 'R007'
  | 'R008'
  | 'R009'
  | 'R010';

export type ReceiptBlockId =
  | 'header'
  | 'brand'
  | 'merchant'
  | 'customer'
  | 'items'
  | 'totals'
  | 'payment'
  | 'delivery'
  | 'wallet'
  | 'verify'
  | 'jarvis_audit'
  | 'footer';

export type ReceiptMetadataEnvelope = {
  receipt_version: string;
  template_id: string;
  template_version: string;
  receipt_type: ReceiptTypeId | string;
  language: string;
  currency: string;
  timezone: string;
  generated_at: string;
  generated_by: string;
  environment: string;
};

export type ReceiptTheme = {
  id: string;
  brand_title: string;
  tagline: string;
  primary_color: string;
  accent_color: string;
  footer_text: string;
  support_email: string;
  support_web: string;
  logo_enabled: boolean;
};

export type ReceiptBlockToggle = {
  enabled: boolean;
};

export type ReceiptTemplateConfig = {
  enabled: boolean;
  template_version: string;
  receipt_type: ReceiptTypeId | string;
  language: string;
  currency: string;
  timezone: string;
  blocks: ReceiptBlockId[];
};

export type ReceiptConfig = {
  schema_version: number;
  receipt_core_version: string;
  updated_at: string;
  environment_default: string;
  theme: ReceiptTheme;
  blocks: Record<ReceiptBlockId, ReceiptBlockToggle>;
  templates: Record<string, ReceiptTemplateConfig>;
};

export type ReceiptLineStyle = {
  bold?: boolean;
  size?: number;
  color?: string;
};

export type ReceiptLine = {
  text: string;
  style?: ReceiptLineStyle;
};

export type ReceiptBlockSection = {
  block_id: ReceiptBlockId;
  lines: ReceiptLine[];
};

export type ReceiptDocument = {
  metadata: ReceiptMetadataEnvelope;
  theme: ReceiptTheme;
  sections: ReceiptBlockSection[];
  /** Anti-forgery verify URL — embedded as QR when set (not payment QR). */
  verify_qr_url?: string;
  layout?: 'marketplace' | 'linear';
  render_data?: ReceiptRenderData;
};

export type ReceiptRenderRequest = {
  template_id: string;
  environment?: string;
  generated_by?: string;
  data?: ReceiptRenderData;
};

export const MARKETPLACE_RECEIPT_TEMPLATE_ID = 'marketplace-v1';

export type ReceiptRenderData = {
  header?: {
    title?: string;
    receipt_number?: string;
    order_number?: string;
    issue_date?: string;
    status?: string;
  };
  brand?: { subtitle?: string };
  merchant?: { name?: string; merchant_id?: string };
  customer?: { name?: string };
  items?: Array<{ title: string; qty: number; amount: string }>;
  totals?: {
    subtotal?: string;
    delivery?: string;
    discount?: string;
    vat?: string;
    total?: string;
  };
  payment?: { method?: string; status?: string; reference?: string; paid_at?: string };
  delivery?: { method?: string; fee?: string };
  wallet?: { balance?: string };
  verify?: { url?: string; token?: string };
  jarvis_audit?: {
    risk_score?: string;
    fraud?: string;
    audit_id?: string;
    integrity?: string;
    jarvis_version?: string;
  };
  footer?: Record<string, never>;
};

export type ReceiptEngineResult = {
  document: ReceiptDocument;
  pdf: Uint8Array;
  validation: ReceiptValidationResult;
};

export type ReceiptValidationResult = {
  ok: boolean;
  metadata: { ok: boolean; errors: string[] };
  unicode: { ok: boolean; errors: string[]; sample_thai: string };
  pdf: { ok: boolean; errors: string[]; byte_length: number; single_page?: boolean; pages?: number };
  engine: { ok: boolean; errors: string[] };
};

export type ReceiptConfigSource = 'default_json' | 'env_json' | 'env_path' | 'local_dev_file';

export type LoadedReceiptConfig = {
  config: ReceiptConfig;
  source: ReceiptConfigSource;
  path?: string;
};
