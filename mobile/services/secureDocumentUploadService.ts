/**
 * Secure Document Upload Service
 *
 * SECURITY RULES:
 * - All uploaded images must be sent directly to a secure backend endpoint.
 * - In mock/dev: use Blob URL or Base64 only for temporary UI preview.
 * - Never store the actual image string in any client-side persistent storage.
 *
 * PRODUCTION: Integrate with Private S3 Bucket + Signed URLs or Secure Vault.
 * - POST /api/upload/document → backend stores in S3, returns signed URL
 * - Store only URLs in user profile; never persist base64 in localStorage
 */
import axios, { AxiosError } from "axios";
import { api } from "./api";

const PREMIUM_BRANDS = [
  "BMW",
  "Mercedes-Benz",
  "Mercedes",
  "Audi",
  "Porsche",
  "Lexus",
  "Volvo",
  "Jaguar",
  "Land Rover",
  "Mini",
];

export type VehicleCategory = "standard" | "premium";

/**
 * Compute vehicle category from brand (server-side logic).
 * Used by backend; client should NOT send vehicle_category to avoid manipulation.
 */
export function classifyVehicleCategory(
  brand: string | null | undefined,
): VehicleCategory {
  if (!brand) return "standard";
  const normalized = brand.trim().toUpperCase();
  const isPremium = PREMIUM_BRANDS.some((b) =>
    normalized.includes(b.toUpperCase().replace(/-/g, " ")),
  );
  return isPremium ? "premium" : "standard";
}

/**
 * Upload document image to secure backend.
 * Returns URL for storage in profile; never returns base64.
 *
 * TODO PRODUCTION: Replace with Private S3 Bucket + Signed URLs:
 * - Backend: POST /api/upload/document (multipart/form-data)
 * - Backend stores in S3 with private ACL, returns signed URL (expiry 1h for read)
 * - Or use Secure Vault with encrypted storage
 */
export type UploadDocumentOptions = {
  /** Override token (defaults to localStorage `meerak_token` via axios interceptor). */
  token?: string;
  /**
   * When `false`, do not fall back to a temporary `blob:` URL — throw with a clear error (use for KYC).
   * Default `true` keeps legacy Settings UX when backend is down in dev.
   */
  allowBlobFallback?: boolean;
};

function normalizeUploadOptions(
  tokenOrOptions?: string | UploadDocumentOptions,
): UploadDocumentOptions {
  if (typeof tokenOrOptions === "string") {
    return { token: tokenOrOptions || undefined, allowBlobFallback: true };
  }
  return { allowBlobFallback: true, ...(tokenOrOptions || {}) };
}

/**
 * ข้อความให้ผู้ใช้ทั่วไปเมื่อการอัปโหลดล้มเหลวจากเครือข่าย/โหลดไม่ครบ —
 * ไม่แสดงรายละเอียดเทคนิค (พร็อกซี, CORS) เพื่อไม่ให้สับสน
 */
export const DOCUMENT_UPLOAD_SIMPLE_RETRY_MESSAGE =
  "ข้อมูลยังไม่สมบูรณ์ กรุณาอัปโหลดใหม่";

function toUserFacingUploadError(err: unknown): string {
  const simpleRetry = DOCUMENT_UPLOAD_SIMPLE_RETRY_MESSAGE;
  const readServerSnippet = (): string | null => {
    const d = (
      axios.isAxiosError(err) ? (err as AxiosError).response?.data : undefined
    ) as Record<string, unknown> | string | undefined;
    if (d == null) return null;
    if (typeof d === "string") {
      const t = d.replace(/<[^>]+>/g, "").trim();
      return t ? t.slice(0, 200) : null;
    }
    if (typeof d === "object") {
      const e = (d as { error?: unknown }).error;
      const m = (d as { message?: unknown }).message;
      if (typeof e === "string" && e.trim()) return e.trim().slice(0, 200);
      if (typeof m === "string" && m.trim()) return m.trim().slice(0, 200);
    }
    return null;
  };

  if (axios.isAxiosError(err)) {
    const ax = err as AxiosError<{ error?: string; message?: string } | string>;
    const status = ax.response?.status;
    const fromServer = readServerSnippet();
    if (status === 401) {
      return "กรุณาเข้าสู่ระบบใหม่ แล้วลองอัปโหลดอีกครั้ง";
    }
    if (status === 413) {
      return "ไฟล์รูปมีขนาดใหญ่เกินไป — ลองเลือกรูปที่เล็กลงหรือบีบอัดก่อนส่ง";
    }
    if (ax.code === "ECONNABORTED") {
      return "ใช้เวลานานกว่าปกติเล็กน้อย — เรากำลังดำเนินการต่อ โปรลองอัปโหลดอีกครั้งหรือเลือกรูปที่เล็กลง";
    }
    if (!ax.response && /Network Error/i.test(String(ax.message || ""))) {
      return "กำลังดำเนินการต่อ — ใช้เวลานานกว่าปกติเล็กน้อย โปรลองอัปโหลดใหม่หรือสลับสัญญาณถ้าสะดวก";
    }
    if (
      typeof status === "number" &&
      status >= 400 &&
      status < 500 &&
      fromServer
    ) {
      return `อัปโหลดไม่สำเร็จ: ${fromServer}`;
    }
    if (status === 429) {
      return "มีการใช้งานถี่เกินไปช่วงสั้นๆ — กรุณารอสักครู่แล้วลองอัปโหลดใหม่";
    }
    return simpleRetry;
  }
  if (
    err instanceof Error &&
    err.message &&
    /ไม่ได้รับลิงก์ไฟล์จากเซิร์ฟเวอร์ได้|เซิร์ฟเวอร์ไม่ส่งลิงก์/.test(
      err.message,
    )
  ) {
    return simpleRetry;
  }
  return simpleRetry;
}

export async function uploadDocumentToSecure(
  file: File,
  documentType: string,
  tokenOrOptions?: string | UploadDocumentOptions,
): Promise<{ url: string }> {
  const opts = normalizeUploadOptions(tokenOrOptions);
  const allowBlobFallback = opts.allowBlobFallback !== false;

  const formData = new FormData();
  formData.append("file", file);
  formData.append("documentType", documentType);

  try {
    const res = await api.post<{
      url?: string;
      signed_url?: string;
      secure_url?: string;
    }>(
      "/upload/document",
      formData,
      opts.token
        ? { headers: { Authorization: `Bearer ${opts.token}` } }
        : undefined,
    );
    const url = res.data?.url || res.data?.signed_url || res.data?.secure_url;
    const trimmed = url != null ? String(url).trim() : "";
    if (!trimmed) {
      throw new Error("เซิร์ฟเวอร์ไม่ส่งลิงก์ไฟล์กลับมา");
    }
    return { url: trimmed };
  } catch (err: unknown) {
    if (allowBlobFallback) {
      const blobUrl = URL.createObjectURL(file);
      return { url: blobUrl };
    }
    if (axios.isAxiosError(err)) {
      const ax = err as AxiosError;
      console.error("[upload/document] failed", {
        documentType,
        status: ax.response?.status,
        code: ax.code,
        url: ax.config?.baseURL
          ? `${ax.config.baseURL}${ax.config.url ?? ""}`
          : ax.config?.url,
      });
    } else {
      console.error("[upload/document] failed", documentType, err);
    }
    throw new Error(toUserFacingUploadError(err));
  }
}

/**
 * Check if URL is a temporary blob (must not be persisted).
 */
export function isBlobUrl(url: string): boolean {
  return !!url && url.startsWith("blob:");
}

/**
 * Convert File to Blob URL for temporary UI preview.
 * Caller MUST revoke the URL when done (e.g. on modal close).
 */
export function fileToBlobUrl(file: File): string {
  return URL.createObjectURL(file);
}

/**
 * Revoke Blob URL to free memory and prevent leaks.
 * Call after modal close or when replacing preview.
 */
export function revokeBlobUrl(url: string): void {
  if (url && url.startsWith("blob:")) {
    try {
      URL.revokeObjectURL(url);
    } catch (_) {}
  }
}
