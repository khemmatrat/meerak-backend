import { api } from "./api";

export type PrbCarType = "sedan" | "pickup" | "motorcycle";

export interface PrbConfig {
  enabled: boolean;
  min_wallet_for_entry_thb: number;
  first_order_discount_thb: number;
  platform_fee_by_car_type: Record<string, number>;
  base_price_by_car_type: Record<string, number>;
  pricing_by_car_type?: Record<string, { base: number; fee: number }>;
  address_line_max_chars: number;
  promo_banner_text?: string;
}

export interface PrbEligibility {
  ok: boolean;
  wallet_balance: number;
  can_enter: boolean;
  has_promo: boolean;
  promo_discount_thb: number;
  user_profile?: {
    full_name?: string;
    phone?: string;
    national_id?: string;
  };
}

export interface PrbOrderPayload {
  car_type: PrbCarType;
  registration_year?: number;
  registration_number: string;
  registration_province?: string;
  chassis_number: string;
  chassis_search_7?: string;
  engine_number?: string;
  vehicle_brand?: string;
  vehicle_model?: string;
  vehicle_year?: number;
  engine_cc?: number;
  vehicle_weight_kg?: number;
  seat_count?: number;
  coverage_start_date?: string;
  coverage_end_date?: string;
  id_type?: string;
  national_id: string;
  name_prefix?: string;
  first_name: string;
  last_name: string;
  phone_number: string;
  nationality?: string;
  address_line: string;
  address_province: string;
  address_district: string;
  address_subdistrict: string;
  postal_code: string;
  shipping_address: string;
  car_registration_img_url: string;
  id_card_img_url?: string;
  address_proof_img_url?: string;
}

export async function fetchPrbConfig() {
  const { data } = await api.get<{ config: PrbConfig }>("/prb/config", {
    params: { _: Date.now() },
  });
  return data.config;
}

export async function fetchPrbEligibility() {
  const { data } = await api.get<PrbEligibility>("/prb/eligibility");
  return data;
}

export async function fetchPrbProvinces() {
  const { data } = await api.get<{ provinces: { id: number; name: string }[] }>(
    "/prb/addresses/provinces",
  );
  return data.provinces;
}

export async function fetchPrbAddressChildren(parentId: number) {
  const { data } = await api.get<{
    children: {
      id: number;
      name: string;
      level: string;
      postal_code?: string;
    }[];
  }>("/prb/addresses/children", { params: { parentId } });
  return data.children;
}

export async function extractPrbOcr(imageUrl: string) {
  const { data } = await api.post<Record<string, unknown>>("/prb/ocr/extract", {
    imageUrl,
  });
  return data;
}

export async function createPrbOrder(payload: PrbOrderPayload) {
  const { data } = await api.post("/prb/orders", payload);
  return data;
}

export async function fetchActivePrbOrder() {
  const { data } = await api.get<{ order: Record<string, unknown> | null }>(
    "/prb/orders/active",
  );
  return data.order;
}

export type PrbOrderSummary = {
  id: string;
  quote_number?: string;
  status?: string;
  car_type?: string;
  registration_number?: string;
  total_price?: number;
  created_at?: string;
  shipped_at?: string | null;
  completed_at?: string | null;
  policy_pdf_url?: string | null;
};

export async function fetchPrbOrderHistory(limit = 20) {
  const { data } = await api.get<{ orders: PrbOrderSummary[] }>(
    "/prb/orders/history",
    { params: { limit } },
  );
  return data.orders || [];
}

export async function fetchPrbOrder(id: string) {
  const { data } = await api.get<{ order: Record<string, unknown> }>(
    `/prb/orders/${id}`,
  );
  return data.order;
}

export async function confirmPrbOrder(id: string) {
  const { data } = await api.post(`/prb/orders/${id}/confirm`);
  return data;
}

export async function disputePrbOrder(id: string, reason: string) {
  const { data } = await api.post(`/prb/orders/${id}/dispute`, { reason });
  return data;
}
