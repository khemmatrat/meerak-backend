/**
 * AQOND Marketplace v2 — embed in mobile shell (Cloud 2 UI) with JWT handoff.
 * Storefront calls Kong /api/v2/merchant/* (Cloud 3) per Architecture Bible.
 */
import { Capacitor } from "@capacitor/core";
import type { NavigateFunction } from "react-router-dom";

export type MarketplaceDeepLinkTarget =
  | "account"
  | "home"
  | "food"
  | "merchant"
  | "merchant_shops"
  | "rider"
  | "rider_setup"
  | "sell"
  | "cart"
  | "orders"
  | "pass"
  | "pro";

const TARGET_PATH: Record<MarketplaceDeepLinkTarget, string> = {
  account: "/m/account",
  home: "/m/home?ftx=1",
  food: "/m/food",
  merchant: "/m/merchant/orders",
  merchant_shops: "/m/merchant/shops",
  rider: "/m/rider/jobs",
  rider_setup: "/m/rider/signup",
  sell: "/m/sell",
  cart: "/m/cart",
  orders: "/m/orders",
  pass: "/m/pass",
  pro: "/m/pro",
};

function trimSlash(url: string): string {
  return url.replace(/\/$/, "");
}

/** Base URL for Next.js storefront — dev: http://localhost:3003, prod: https://aqond.com */
export function getMarketplaceBaseUrl(): string {
  const env =
    (typeof import.meta !== "undefined" &&
      (import.meta as any).env?.VITE_MARKETPLACE_URL) ||
    (typeof import.meta !== "undefined" &&
      (import.meta as any).env?.VITE_PUBLIC_WEB_APP_URL);
  const trimmed = typeof env === "string" ? env.trim() : "";
  if (trimmed) return trimSlash(trimmed);

  if (typeof window !== "undefined") {
    const host = (window.location.hostname || "").toLowerCase();
    if (host === "localhost" || host === "127.0.0.1") {
      return "http://localhost:3003";
    }
  }
  return "https://aqond.com";
}

export function marketplacePath(
  target: MarketplaceDeepLinkTarget | string = "home",
): string {
  if (target.startsWith("/m/")) return target;
  return TARGET_PATH[target as MarketplaceDeepLinkTarget] || TARGET_PATH.home;
}

/** Append embed=1 so storefront hides duplicate tab bar inside mobile iframe. */
function withEmbedQuery(path: string): string {
  const dest = marketplacePath(path);
  if (/[?&]embed=1/.test(dest)) return dest;
  return dest.includes('?') ? `${dest}&embed=1` : `${dest}?embed=1`;
}

/** Handoff URL — token in hash (not logged server-side). */
export function buildMarketplaceHandoffUrl(path = "/m/home"): string {
  const base = getMarketplaceBaseUrl();
  const token = localStorage.getItem("meerak_token");
  const userId = localStorage.getItem("meerak_user_id");
  const dest = withEmbedQuery(path);
  if (!token || !userId) {
    return `${base}/m/login?next=${encodeURIComponent(dest)}`;
  }
  const hash = new URLSearchParams({
    t: token,
    u: userId,
    next: dest,
  }).toString();
  return `${base}/m/auth/handoff#${hash}`;
}

/** In-app embed route (preferred — stays inside mobile shell). */
export function marketplaceEmbedRoute(path = "/m/home"): string {
  const dest = marketplacePath(path);
  return `/storefront?p=${encodeURIComponent(dest)}`;
}

/** Navigate to embedded WebView page inside mobile app. */
export function navigateToMarketplace(
  navigate: NavigateFunction,
  path: MarketplaceDeepLinkTarget | string = "home",
): void {
  navigate(marketplaceEmbedRoute(path));
}

/** Legacy external open — fallback when embed unavailable. */
export async function openMarketplaceExternal(
  path: MarketplaceDeepLinkTarget | string = "home",
): Promise<void> {
  const url = buildMarketplaceHandoffUrl(marketplacePath(path));
  const native =
    Capacitor.getPlatform?.() === "android" ||
    Capacitor.getPlatform?.() === "ios";
  if (native) {
    window.location.href = url;
    return;
  }
  window.open(url, "_blank", "noopener,noreferrer");
}

/** @deprecated use navigateToMarketplace — kept for Home quick-action migration */
export async function openMarketplace(path = "/m/home"): Promise<void> {
  await openMarketplaceExternal(path);
}

/** @deprecated alias */
export function openMarketplaceHandoff(
  token: string | null | undefined,
  userId: string | null | undefined,
  target: MarketplaceDeepLinkTarget = "account",
): void {
  const path = marketplacePath(target);
  if (!token || !userId) {
    void openMarketplaceExternal(path);
    return;
  }
  const url = buildMarketplaceHandoffUrl(path);
  window.open(url, "_blank", "noopener,noreferrer");
}
