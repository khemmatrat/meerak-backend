/** Shop AI Search (LINE / AQOND Shop) — Steps 1–4 only; checkout gated separately. */

export type ShopAiProduct = {
  id: string;
  title: string;
  price_micro: number;
  merchant_id: string;
  merchant_name: string;
  category?: string;
  image_url?: string;
};

export type ShopAiCartLine = {
  product_id: string;
  title: string;
  qty: number;
  unit_price_micro: number;
  merchant_id: string;
  merchant_name: string;
  line_micro: number;
};

export type ShopAiSession = {
  user_key: string;
  phase: 'idle' | 'searched' | 'selected' | 'qty_pending' | 'cart_ready';
  last_query?: string;
  last_search?: ShopAiProduct[];
  selected_product_id?: string;
  pending_qty?: number;
  cart: ShopAiCartLine[];
  updated_at: string;
};

export type ShopAiPostback = {
  action: 'select' | 'qty' | 'checkout' | 'custom_qty';
  product_id?: string;
  value?: string;
};

export type LineTextMessage = { type: 'text'; text: string };
export type LineFlexMessage = { type: 'flex'; altText: string; contents: Record<string, unknown> };
export type LineQuickReply = {
  items: Array<{ type: 'action'; action: { type: 'message' | 'postback'; label: string; text?: string; data?: string } }>;
};

export type ShopAiLinePayload = {
  messages: Array<LineTextMessage | LineFlexMessage>;
  quickReply?: LineQuickReply;
};

export type ShopAiFlowResult = {
  ok: boolean;
  step: 'search' | 'refine' | 'select' | 'qty' | 'cart_summary' | 'checkout_blocked' | 'help';
  session: ShopAiSession;
  line: ShopAiLinePayload;
  error?: string;
};
