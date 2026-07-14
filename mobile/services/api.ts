// Simple API service — ใช้ backend URL ชุดเดียวกับ platform (Bob/Anna เห็นงานเดียวกัน)
import axios from "axios";
import { Capacitor } from "@capacitor/core";

const DEFAULT_PRODUCTION_API = "https://api.aqond.com";

/** แอป iOS/Android — ใช้ getPlatform() เป็นหลัก เพราะ WebView บางรุ่นให้ isNativePlatform() เป็น false ทั้งที่อยู่บน APK */
export function isNativeCapacitorApp(): boolean {
  try {
    const p = Capacitor.getPlatform();
    if (p === "android" || p === "ios") return true;
  } catch {
    /* ignore */
  }
  try {
    return typeof window !== "undefined" && Capacitor.isNativePlatform();
  } catch {
    return false;
  }
}

/** localhost / 127.0.0.1 บน APK ชี้ไปที่ตัวเครื่อง ไม่ใช่ PC — ห้ามใช้เป็น API ยกเว้นเปิด VITE_ALLOW_LOOPBACK_ON_NATIVE */
function isLoopbackBackendUrl(url: string): boolean {
  const s = url.trim().toLowerCase();
  return s.includes("localhost") || s.includes("127.0.0.1");
}

function isLocalWebDevHost(): boolean {
  if (typeof window === "undefined") return false;
  const host = (window.location.hostname || "").toLowerCase();
  return host === "localhost" || host === "127.0.0.1";
}

const getBackendBase = (): string => {
  const env =
    (typeof import.meta !== "undefined" &&
      (import.meta as any).env?.VITE_BACKEND_URL) ||
    (typeof process !== "undefined" && process.env?.REACT_APP_BACKEND_URL);
  const trimmed = typeof env === "string" ? env.trim() : "";

  const isNative = isNativeCapacitorApp();

  const allowLoopbackOnNative =
    typeof import.meta !== "undefined" &&
    String((import.meta as any).env?.VITE_ALLOW_LOOPBACK_ON_NATIVE || "") ===
      "1";

  // Capacitor iOS/Android: ถ้า build ด้วย localhost ในตัวแปรแวดล้อม คำขอจะไปที่ตัวเครื่อง → login ค้าง/ล้มเหลว
  if (isNative) {
    if (trimmed && (!isLoopbackBackendUrl(trimmed) || allowLoopbackOnNative)) {
      return trimmed.replace(/\/$/, "");
    }
    return DEFAULT_PRODUCTION_API;
  }

  const forceRemoteApiOnLocalDev =
    (typeof import.meta !== "undefined" &&
      String((import.meta as any).env?.VITE_DEV_FORCE_REMOTE_API || "") ===
        "1") ||
    (typeof process !== "undefined" &&
      String(process.env?.REACT_APP_DEV_FORCE_REMOTE_API || "") === "1");

  // Web dev on localhost: default to local backend for reliable debugging.
  // This avoids Cloudflare 502/CORS masking that can hide upstream JSON error details.
  if (
    typeof import.meta !== "undefined" &&
    (import.meta as any).env?.DEV &&
    isLocalWebDevHost() &&
    !forceRemoteApiOnLocalDev
  ) {
    if (!trimmed || !isLoopbackBackendUrl(trimmed)) {
      return "http://localhost:3001";
    }
  }

  let base = trimmed || "http://localhost:3001";

  // Mixed Content fix: เมื่อหน้าโหลดผ่าน HTTPS แต่ base เป็น HTTP → เบราว์เซอร์จะบล็อก
  // ใช้ HTTPS URL แทน (ต้องมี reverse proxy + SSL สำหรับ api.aqond.com)
  if (typeof window !== "undefined" && window.location?.protocol === "https:") {
    const httpsOverride =
      (typeof import.meta !== "undefined" &&
        (import.meta as any).env?.VITE_BACKEND_URL_HTTPS) ||
      (typeof process !== "undefined" &&
        process.env?.REACT_APP_BACKEND_URL_HTTPS);
    if (httpsOverride) {
      base = String(httpsOverride).replace(/\/$/, "");
    } else if (base.startsWith("http://")) {
      const host = (window.location.hostname || "").toLowerCase();
      // โหลดแอปจากโดเมน AQOND บน HTTPS แต่ build ติดค่า HTTP (เช่น IP/LAN) → เบราว์เซอร์บล็อกทุกคำขอ
      const isAqondWebHost =
        !!host &&
        host !== "api.aqond.com" &&
        (host === "aqond.com" || host.endsWith(".aqond.com"));
      if (isAqondWebHost) {
        base = DEFAULT_PRODUCTION_API;
      }
    }
  }
  return base.replace(/\/$/, "");
};

/** บังคับใช้ HTTPS เมื่อหน้าโหลดผ่าน HTTPS (แก้ Mixed Content) — เรียกทุก request */
const forceHttpsBase = (): string | null => {
  if (typeof window === "undefined") return null;
  if (window.location.protocol !== "https:") return null;
  const host = (window.location.hostname || "").toLowerCase();
  const isAqondWebHost =
    !!host &&
    host !== "api.aqond.com" &&
    (host === "aqond.com" || host.endsWith(".aqond.com"));
  if (isAqondWebHost) {
    return "https://api.aqond.com/api";
  }
  return null;
};

export { getBackendBase, forceHttpsBase };

/** POST /kyc/submit — หลายรูป + อัปโหลด S3 บน LTE มักเกิน 5 นาที → เพดาน client (ให้ซิงค์กับ nginx/proxy upstream) */
export const HTTP_TIMEOUT_KYC_SUBMIT_MS = 900000; // 15 นาที

/** POST /kyc/submit-from-uploads — JSON เฉพาะลิงก์ (เล็ก) ฟอลแบ็กเลี่ยง proxy ตัด multipart */
export const HTTP_TIMEOUT_KYC_JSON_MS = 180000; // 3 นาที พอเหลือเกินสำหรับ INSERT + เครือข่าย

/** FormData / อัปโหลดใหญ่อื่น (ไม่ใช่ POST /kyc/submit เดี่ยว) */
export const HTTP_TIMEOUT_MULTIPART_DEFAULT_MS = 600000; // 10 นาที

/** สมัคร/ล็อกอิน — เกินค่า default ของ axios และรองรับเบราว์เซอร์ในแอพ (Facebook LINE ฯลฯ) ที่มีสัญญาณผันผ่วน */
export const HTTP_TIMEOUT_AUTH_MS = 180000; // 3 นาที — ลดการตัดคำขอบนเครือข่ายมือถือ / in-app browser ก่อนได้คำตอบ

function resolveAxiosBaseURL(): string {
  const base = getBackendBase();
  let baseURL = `${base}/api`;
  const httpsBase = forceHttpsBase();
  if (httpsBase && baseURL.startsWith("http://")) {
    baseURL = httpsBase;
  }
  return baseURL;
}

const api = axios.create({
  timeout: 10000,
});

api.interceptors.request.use(
  (config) => {
    config.baseURL = resolveAxiosBaseURL();
    const token = localStorage.getItem("meerak_token");
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    const path = typeof config.url === "string" ? config.url : "";
    const methodUp = String(config.method || "").toUpperCase();

    // FormData ต้องให้เบราว์เซอร์ใส่ multipart boundary — ห้ามค้าง Content-Type: application/json
    if (typeof FormData !== "undefined" && config.data instanceof FormData) {
      const h = config.headers as Record<string, unknown>;
      delete h["Content-Type"];
      delete h["content-type"];
      const isMultipartKycSubmit =
        methodUp === "POST" &&
        (path === "/kyc/submit" || path.endsWith("/kyc/submit"));
      const multipartCap = isMultipartKycSubmit
        ? HTTP_TIMEOUT_KYC_SUBMIT_MS
        : HTTP_TIMEOUT_MULTIPART_DEFAULT_MS;
      if (config.timeout == null || config.timeout < multipartCap) {
        config.timeout = multipartCap;
      }
    }

    if (
      (path === "/stories" || path.endsWith("/stories")) &&
      methodUp === "POST"
    ) {
      if (config.timeout == null || config.timeout < 300000) {
        config.timeout = 300000;
      }
    }
    if (path.includes("/upload") && methodUp === "POST") {
      if (
        config.timeout == null ||
        config.timeout < HTTP_TIMEOUT_MULTIPART_DEFAULT_MS
      ) {
        config.timeout = HTTP_TIMEOUT_MULTIPART_DEFAULT_MS;
      }
    }
    if (
      (path === "/kyc/submit" || path.endsWith("/kyc/submit")) &&
      methodUp === "POST" &&
      typeof FormData !== "undefined" &&
      !(config.data instanceof FormData)
    ) {
      if (
        config.timeout == null ||
        config.timeout < HTTP_TIMEOUT_KYC_SUBMIT_MS
      ) {
        config.timeout = HTTP_TIMEOUT_KYC_SUBMIT_MS;
      }
    }
    if (path.includes("/kyc/submit-from-uploads") && methodUp === "POST") {
      if (config.timeout == null || config.timeout < HTTP_TIMEOUT_KYC_JSON_MS) {
        config.timeout = HTTP_TIMEOUT_KYC_JSON_MS;
      }
    }
    if (
      path.includes("/wallet/deposit/manual") &&
      String(config.method || "").toUpperCase() === "POST"
    ) {
      if (config.timeout == null || config.timeout < 300000) {
        config.timeout = 300000;
      }
    }
    // PaySo: backend เรียก API ภายนอกสร้าง QR — 10s มักสั้นเกินไป → timeout/network error ปลอม
    if (
      path.includes("/wallet/deposit/payso") &&
      String(config.method || "").toUpperCase() === "POST"
    ) {
      if (config.timeout == null || config.timeout < 90000) {
        config.timeout = 90000;
      }
    }
    if (
      (path === "/auth/register" ||
        path.endsWith("/auth/register") ||
        path === "/auth/login" ||
        path.endsWith("/auth/login")) &&
      methodUp === "POST"
    ) {
      if (config.timeout == null || config.timeout < HTTP_TIMEOUT_AUTH_MS) {
        config.timeout = HTTP_TIMEOUT_AUTH_MS;
      }
      if (isNativeCapacitorApp()) {
        const h = config.headers as Record<string, string>;
        if (!h["x-client-platform"]) {
          try {
            h["x-client-platform"] = Capacitor.getPlatform();
          } catch {
            /* ignore */
          }
        }
      }
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  },
);

// Centralized 429 (Rate Limit) handling — attach retry_after for Smart Retry UI
// Network/connection errors → ข้อความที่เป็นมิตร (Production: api.aqond.com)
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      const reqUrl = String(error.config?.url || "");
      const method = String(error.config?.method || "get").toLowerCase();
      const isAuthAttempt =
        method === "post" &&
        (reqUrl.includes("/auth/login") || reqUrl.includes("/auth/register"));
      const isPublicBanners =
        reqUrl.includes("/banners") &&
        !reqUrl.includes("/banners/") &&
        method === "get";
      const isStoriesApi = reqUrl.includes("/stories");
      if (!isAuthAttempt && !isPublicBanners && !isStoriesApi) {
        localStorage.removeItem("meerak_token");
        // HashRouter: ต้องใช้ #/login ไม่ใช่ /login (โดยเฉพาะ Capacitor / file)
        try {
          window.location.hash = "#/login";
        } catch {
          window.location.href = `${window.location.pathname}${window.location.search}#/login`;
        }
      }
    }
    if (error.response?.status === 429) {
      const data = error.response?.data || {};
      const retryAfter =
        data.retry_after ?? error.response?.headers?.["retry-after"];
      (error as any).retry_after = Math.max(
        1,
        Math.ceil(Number(retryAfter) || 60),
      );
      (error as any).isRateLimit = true;
      (error as any).message =
        data.message ||
        `Too many attempts. Try again in ${(error as any).retry_after} seconds.`;
    }
    if (error.response?.status === 413) {
      const reqUrl413 = String(error.config?.url || "");
      if (reqUrl413.includes("/stories")) {
        (error as any).message =
          "ไฟล์สตอรี่ใหญ่เกินระบบรองรับ — ลองรูปเล็กลง หรืออัปเดตแอปล่าสุด (ระบบจะย่อรูปให้อัตโนมัติ)";
      }
    }
    const ax = error as any;
    const origMsg = typeof ax.message === "string" ? ax.message : "";
    if (typeof ax.code === "string") ax.technicalCode = ax.code;

    // #region agent log (dev เท่านั้น — อย่ายิง localhost บน production / in-app browser)
    if (
      typeof import.meta !== "undefined" &&
      (import.meta as { env?: { DEV?: boolean } }).env?.DEV
    ) {
      const reqUrl = String(error.config?.url || "");
      const method = String(error.config?.method || "get").toUpperCase();
      let hypothesisId = "H_other";
      if (
        !error.response &&
        (ax.code === "ERR_NETWORK" || origMsg.includes("Network Error"))
      )
        hypothesisId = "H1_ERR_NETWORK_no_response";
      else if (ax.code === "ECONNABORTED" || /timeout/i.test(origMsg))
        hypothesisId = "H2_client_timeout_ECONNABORTED";
      else if (
        typeof error.response?.status === "number" &&
        error.response.status >= 500
      )
        hypothesisId = "H3_http_5xx";
      fetch(
        "http://127.0.0.1:7638/ingest/0fd4d8e7-61a2-4558-83aa-540c669e45fd",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Debug-Session-Id": "caa88d",
          },
          body: JSON.stringify({
            sessionId: "caa88d",
            location: "mobile/services/api.ts:error-interceptor",
            message: "axios_error_pre_message_rewrite",
            hypothesisId,
            data: {
              code: ax.code,
              hasResponse: !!error.response,
              httpStatus: error.response?.status,
              method,
              reqUrlSnippet: reqUrl.slice(0, 180),
              origMsgSnippet: origMsg.slice(0, 200),
              timeoutConfigured: error.config?.timeout ?? null,
              baseURLSnippet: String(error.config?.baseURL || "").slice(0, 100),
            },
            timestamp: Date.now(),
            runId: "pre-fix",
          }),
        },
      ).catch(() => {});
    }
    // #endregion

    // คำขอใช้เวลานานผิดปกติ — หลีกเลี่ยงคำว่า timeout / network / เชื่อมต่อขาด (phase trust)
    if (ax.code === "ECONNABORTED" || /timeout/i.test(origMsg)) {
      const reqUrlT = String(error.config?.url || "");
      if (
        reqUrlT.includes("/auth/register") ||
        reqUrlT.includes("/auth/login")
      ) {
        ax.message =
          "ยังสร้างบัญชีไม่สำเร็จ — กรุณากดสมัครสมาชิกอีกครั้ง (อย่าไปหน้าเข้าสู่ระบบจนกว่าจะเห็นข้อความสมัครสำเร็จ)";
      } else if (reqUrlT.includes("/videos/upload")) {
        ax.message =
          "อัปโหลดคลิปใช้เวลานาน — อย่าปิดหน้าจอ ลอง Wi‑Fi หรือคลิปสั้นลง แล้วกดเผยแพร่อีกครั้ง";
      } else {
        ax.message = reqUrlT.includes("/kyc/submit")
          ? "เรากำลังดำเนินการส่งข้อมูลต่อ — ใช้เวลานานกว่าปกติเล็กน้อยในขั้นตอนนี้ โปรรอจนมีผล แล้วลองจาก Wi‑Fi หากสะดวก"
          : "กำลังดำเนินการต่อ — ใช้เวลานานกว่าปกติเล็กน้อย โปรลองอีกครั้งในอีกสักครู่";
      }
      return Promise.reject(error);
    }

    // ไม่ได้รับผลจากเซิร์ฟเวอร์ครั้งนี้ (ภาพรวมเท่าที่ client ทราบ — ไม่ใช้คำว่า network error)
    if (
      !error.response &&
      (ax.code === "ERR_NETWORK" || origMsg.includes("Network Error"))
    ) {
      const native = isNativeCapacitorApp();
      const hostname =
        typeof window !== "undefined" ? window.location?.hostname || "" : "";
      const isLocalWebDev =
        !native && (hostname === "localhost" || hostname === "127.0.0.1");

      const embeddedHint =
        " หากเปิดจากแอพ Facebook / LINE / TikTok แนะนำเลือก “เปิดในเบราว์เซอร์” (Chrome / Safari)";
      const reqPath = String(error.config?.url || "");

      let noResponseMsg =
        "เราจะดำเนินการให้อัตโนมัติเมื่อได้รับผล — กำลังดำเนินการต่อ โปรลองอีกครั้งในอีกสักครู่";
      if (reqPath.includes("/videos/upload")) {
        noResponseMsg =
          "อัปโหลดคลิปไม่สำเร็จ — สัญญาณอาจขาดหรือไฟล์ใหญ่เกินไป ลอง Wi‑Fi คลิปไม่เกิน 100MB หรือเปิดใน Chrome/Safari";
      } else if (reqPath.includes("/stories")) {
        noResponseMsg =
          "แชร์สตอรี่ไม่สำเร็จ — ไฟล์อาจใหญ่เกินไปหรือเซิร์ฟเวอร์ปฏิเสธ (413) ลองรูปเล็กลง หรืออัปเดตแอป";
      } else if (
        reqPath.includes("/auth/register") ||
        reqPath.includes("/auth/login")
      ) {
        noResponseMsg =
          "ยังสร้างบัญชีไม่สำเร็จ — กรุณากดสมัครสมาชิกอีกครั้ง (อย่าไปหน้าเข้าสู่ระบบจนกว่าจะเห็นข้อความสมัครสำเร็จ)" +
          embeddedHint;
      }

      ax.message = isLocalWebDev
        ? "โหมดพัฒนา: ยังไม่ได้รับคำตอบจากเซิร์ฟเวอร์ — ตรวจสอบว่า backend รันอยู่และพอร์ตตรง"
        : noResponseMsg;

      if (import.meta.env.DEV) {
        console.error("[api] request failed without response", {
          code: ax.code,
          message: origMsg,
          url: error.config?.url,
          baseURL: error.config?.baseURL,
          method: error.config?.method,
        });
      }
    }
    return Promise.reject(error);
  },
);

export { api };
const API_URL =
  process.env.REACT_APP_API_URL ||
  "http://localhost:5001/meerak-project/us-central1/api";

// Types
export interface User {
  id: number;
  email: string;
  username: string;
  name?: string;
  phone?: string;
  role: string;
  created_at?: string;
}

export interface AuthResponse {
  message: string;
  user: User;
  token: string;
}

export class ApiService {
  private static async request<T>(
    endpoint: string,
    method: string = "GET",
    data?: any,
  ): Promise<T> {
    const token = localStorage.getItem("meerak_token");

    const headers: HeadersInit = {
      "Content-Type": "application/json",
    };

    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }

    const config: RequestInit = {
      method,
      headers,
    };

    if (data) {
      config.body = JSON.stringify(data);
    }

    console.log(`API ${method} ${endpoint}`, data);

    const response = await fetch(`${API_URL}${endpoint}`, config);

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`API Error ${response.status}:`, errorText);

      if (response.status === 401) {
        localStorage.removeItem("meerak_token");
        localStorage.removeItem("meerak_user_id");
        try {
          window.location.hash = "#/login";
        } catch {
          window.location.href = `${window.location.pathname}${window.location.search}#/login`;
        }
      }

      let errorMessage = "Request failed";
      try {
        const errorData = JSON.parse(errorText);
        errorMessage = errorData.error || errorMessage;
      } catch (e) {
        errorMessage = errorText || errorMessage;
      }

      throw new Error(errorMessage);
    }

    return response.json();
  }

  // Auth endpoints
  static async login(email: string, password: string): Promise<AuthResponse> {
    return this.request("/auth/login", "POST", { email, password });
  }

  static async register(
    email: string,
    username: string,
    password: string,
    name?: string,
    phone?: string,
  ): Promise<AuthResponse> {
    return this.request("/auth/register", "POST", {
      email,
      username,
      password,
      name,
      phone,
    });
  }

  static async getProfile(): Promise<User> {
    return this.request("/auth/profile");
  }

  static async logout() {
    localStorage.removeItem("meerak_token");
    localStorage.removeItem("meerak_user_id");
  }

  // Admin endpoints
  static async getAllUsers(): Promise<User[]> {
    return this.request("/admin/users");
  }
}

// For backward compatibility
export const authAPI = {
  login: ApiService.login,
  register: ApiService.register,
  getProfile: ApiService.getProfile,
  logout: ApiService.logout,
};

export default ApiService;
