/**
 * Direct Kong v2 merchant API client (Cloud 3 via api.aqond.com).
 * Paths: https://api.aqond.com/api/v2/merchant/v1/*
 * Food:  https://api.aqond.com/api/v2/merchant/food/v1/food/*
 *
 * Used for hybrid native calls; embedded WebView uses storefront UI.
 */
import axios, { type AxiosInstance } from "axios";
import { getBackendBase } from "./api";

function authHeaders(): Record<string, string> {
  const h: Record<string, string> = {
    "Content-Type": "application/json",
    "X-Aqond-Region": "TH",
  };
  const token = localStorage.getItem("meerak_token");
  const userId = localStorage.getItem("meerak_user_id");
  if (token) h.Authorization = `Bearer ${token}`;
  if (userId) h["X-User-Id"] = userId;
  return h;
}

function v2Prefix(): string {
  const env =
    (typeof import.meta !== "undefined" &&
      (import.meta as any).env?.VITE_V2_MERCHANT_PREFIX) ||
    "/api/v2/merchant";
  const p = String(env).trim() || "/api/v2/merchant";
  return p.startsWith("/") ? p : `/${p}`;
}

function v2FoodPrefix(): string {
  const env =
    (typeof import.meta !== "undefined" &&
      (import.meta as any).env?.VITE_V2_FOOD_PREFIX) ||
    "/api/v2/merchant/food";
  const p = String(env).trim() || "/api/v2/merchant/food";
  return p.startsWith("/") ? p : `/${p}`;
}

let merchantClient: AxiosInstance | null = null;
let foodClient: AxiosInstance | null = null;

export function v2MerchantApi(): AxiosInstance {
  if (!merchantClient) {
    const base = `${getBackendBase()}${v2Prefix()}`;
    merchantClient = axios.create({ baseURL: base, timeout: 30_000 });
    merchantClient.interceptors.request.use((config) => {
      config.headers = { ...config.headers, ...authHeaders() } as any;
      return config;
    });
  }
  return merchantClient;
}

export function v2FoodApi(): AxiosInstance {
  if (!foodClient) {
    const base = `${getBackendBase()}${v2FoodPrefix()}`;
    foodClient = axios.create({ baseURL: base, timeout: 30_000 });
    foodClient.interceptors.request.use((config) => {
      config.headers = { ...config.headers, ...authHeaders() } as any;
      return config;
    });
  }
  return foodClient;
}

/** BFF home feed — GET /v1/home */
export async function fetchV2Home() {
  const { data } = await v2MerchantApi().get("/v1/home");
  return data;
}

/** Nearby restaurants — GET /v1/food/nearby */
export async function fetchV2FoodNearby(sort?: "distance" | "rating") {
  const q = sort ? `?sort=${sort}` : "";
  const { data } = await v2FoodApi().get(`/v1/food/nearby${q}`);
  return data;
}

/** Mobile shell metadata from BFF */
export async function fetchV2MobileShell() {
  const { data } = await v2MerchantApi().get("/v1/mobile/shell");
  return data as {
    engine?: string;
    version?: string;
    bff_base?: string;
    tabs?: { id: string; route: string }[];
  };
}
