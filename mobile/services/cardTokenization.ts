/**

 * Client-side card tokenization — PaySo merchant keys จาก backend .env

 * โหมด backend: tokenize ผ่าน POST /api/payments/card-token (API Key + Secret Key จริง)

 * โหมด client: Omise.js + pkey_ (ถ้ามี)

 */

import { api } from "./api";

type CardTokenCallbackResponse = {
  id?: string;

  object?: string;

  card?: {
    last_digits?: string;

    brand?: string;

    expiration_month?: number;

    expiration_year?: number;
  };

  message?: string;
};

export type CardTokenSdk = {
  setPublicKey(key: string): void;

  createToken(
    type: "card",

    data: {
      name: string;

      number: string;

      expiration_month: number;

      expiration_year: number;

      security_code: string;
    },

    callback: (statusCode: number, response: CardTokenCallbackResponse) => void,
  ): void;
};

let scriptLoaded = false;

let scriptLoading: Promise<void> | null = null;

let publicKey: string | null = null;

let sdkUrl: string | null = null;

let sdkGlobalName: string | null = null;

let tokenMode: "backend" | "client" | "none" = "none";

function envTrim(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function resolveSdkUrl(): string {
  return (
    sdkUrl ||
    envTrim(import.meta.env.VITE_PAYSO_CARD_SDK_URL) ||
    envTrim(import.meta.env.VITE_PAYMENT_GATEWAY_CARD_SDK_URL) ||
    "https://cdn.omise.co/omise.js"
  );
}

function resolveSdkGlobalName(): string {
  return (
    sdkGlobalName ||
    envTrim(import.meta.env.VITE_PAYSO_CARD_SDK_GLOBAL) ||
    envTrim(import.meta.env.VITE_PAYMENT_GATEWAY_CARD_SDK_GLOBAL) ||
    "Omise"
  );
}

function getSdk(): CardTokenSdk {
  const name = resolveSdkGlobalName();

  const w = window as unknown as Record<string, CardTokenSdk | undefined>;

  const sdk = w[name];

  if (!sdk) throw new Error("Card token SDK is not available");

  return sdk;
}

async function loadScriptOnce(): Promise<void> {
  if (scriptLoaded) return;

  if (scriptLoading) return scriptLoading;

  scriptLoading = new Promise((resolve, reject) => {
    const url = resolveSdkUrl();

    const script = document.createElement("script");

    script.src = url;

    script.async = true;

    script.onload = () => {
      scriptLoaded = true;

      scriptLoading = null;

      try {
        const sdk = getSdk();

        if (publicKey) sdk.setPublicKey(publicKey);
      } catch (e) {
        reject(e);

        return;
      }

      resolve();
    };

    script.onerror = () => {
      scriptLoading = null;

      reject(new Error("Failed to load card token SDK"));
    };

    document.head.appendChild(script);
  });

  return scriptLoading;
}

/**

 * โหลด config จาก backend (PaySo .env) แล้ว init SDK — เรียกก่อน createCardToken

 */

export async function ensureCardTokenSdkReady(): Promise<boolean> {
  if (tokenMode === "backend") return true;

  if (tokenMode === "client" && publicKey && scriptLoaded) return true;

  const envPub =
    envTrim(import.meta.env.VITE_PAYSO_PUBLIC_KEY) ||
    envTrim(import.meta.env.VITE_PAYSO_OMISE_PUBLIC_KEY) ||
    envTrim(import.meta.env.VITE_PAYMENT_GATEWAY_PUBLIC_KEY);

  if (envPub && /^pkey_(test|live)_/i.test(envPub)) {
    tokenMode = "client";

    publicKey = envPub;

    sdkUrl =
      envTrim(import.meta.env.VITE_PAYSO_CARD_SDK_URL) ||
      envTrim(import.meta.env.VITE_PAYMENT_GATEWAY_CARD_SDK_URL) ||
      null;

    sdkGlobalName =
      envTrim(import.meta.env.VITE_PAYSO_CARD_SDK_GLOBAL) ||
      envTrim(import.meta.env.VITE_PAYMENT_GATEWAY_CARD_SDK_GLOBAL) ||
      null;

    initCardTokenSdk(envPub);

    await loadScriptOnce();

    return true;
  }

  try {
    const { data } = await api.get<{
      publicKey?: string | null;

      sdkUrl?: string;

      sdkGlobal?: string;

      tokenMode?: "backend" | "client" | "none";

      configured?: boolean;
    }>("/payments/card-token-config");

    if (data?.tokenMode === "backend" && data?.configured) {
      tokenMode = "backend";

      return true;
    }

    if (data?.publicKey && data?.tokenMode === "client") {
      tokenMode = "client";

      publicKey = data.publicKey;

      sdkUrl = data.sdkUrl || null;

      sdkGlobalName = data.sdkGlobal || null;

      initCardTokenSdk(data.publicKey);

      await loadScriptOnce();

      return true;
    }
  } catch {
    /* backend unavailable */
  }

  tokenMode = "none";

  return false;
}

/** @deprecated ใช้ ensureCardTokenSdkReady() — คงไว้เพื่อ backward compat */

export async function loadCardTokenSdk(): Promise<void> {
  const ok = await ensureCardTokenSdkReady();

  if (!ok) throw new Error("PaySo card token SDK is not configured");
}

export function initCardTokenSdk(key: string): void {
  publicKey = key;

  if (scriptLoaded) {
    try {
      getSdk().setPublicKey(key);
    } catch {
      /* SDK not loaded yet */
    }
  }
}

async function createCardTokenViaBackend(card: {
  number: string;

  name: string;

  expiryMonth: number;

  expiryYear: number;

  cvc: string;
}) {
  const { data } = await api.post<{
    id?: string;

    card?: CardTokenCallbackResponse["card"];

    error?: string;
  }>("/payments/card-token", {
    number: card.number.replace(/\s/g, ""),

    name: card.name,

    expiration_month: card.expiryMonth,

    expiration_year: card.expiryYear,

    security_code: card.cvc,
  });

  if (!data?.id) {
    throw new Error(data?.error || "ไม่สามารถสร้าง card token ได้");
  }

  return {
    id: data.id,

    card: data.card || {},
  };
}

export async function createCardToken(card: {
  number: string;

  name: string;

  expiryMonth: number;

  expiryYear: number;

  cvc: string;
}): Promise<{
  id: string;

  card: {
    last_digits?: string;

    brand?: string;

    expiration_month?: number;

    expiration_year?: number;
  };
}> {
  const ready = await ensureCardTokenSdkReady();

  if (!ready) {
    throw new Error(
      "PaySo card ยังไม่ได้ตั้งค่า — ใส่ PAYSO_SECRET_KEY (Secret Key) + PAYSO_INQUIRY_API_KEY (API Key) ใน backend .env",
    );
  }

  if (tokenMode === "backend") {
    return createCardTokenViaBackend(card);
  }

  if (!publicKey) {
    throw new Error("PaySo card public key ไม่พร้อมใช้งาน");
  }

  const sdk = getSdk();

  return new Promise((resolve, reject) => {
    sdk.createToken(
      "card",

      {
        name: card.name,

        number: card.number.replace(/\s/g, ""),

        expiration_month: card.expiryMonth,

        expiration_year: card.expiryYear,

        security_code: card.cvc,
      },

      (statusCode, response) => {
        if (statusCode === 200 && response.id) {
          resolve({
            id: response.id,

            card: response.card || {},
          });
        } else {
          reject(
            new Error(response.message || `Card token error: ${statusCode}`),
          );
        }
      },
    );
  });
}

export function formatCardNumber(value: string): string {
  const cleaned = value.replace(/\D/g, "");

  const chunks = cleaned.match(/.{1,4}/g) || [];

  return chunks.join(" ").slice(0, 19);
}

export function formatExpiry(value: string): string {
  const cleaned = value.replace(/\D/g, "");

  if (cleaned.length >= 2) {
    return (
      cleaned.slice(0, 2) +
      (cleaned.length > 2 ? "/" + cleaned.slice(2, 4) : "")
    );
  }

  return cleaned;
}

export function parseExpiry(
  value: string,
): { month: number; year: number } | null {
  const cleaned = value.replace(/\D/g, "");

  if (cleaned.length < 3) return null;

  const month = parseInt(cleaned.slice(0, 2), 10);

  let year = parseInt(cleaned.slice(2), 10);

  if (year < 100) year += 2000;

  if (month < 1 || month > 12) return null;

  return { month, year };
}
