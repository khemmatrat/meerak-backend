import type { AdminRole } from "../types";

/**
 * RBAC สำหรับหน้าแอดมิน — ซ่อนเมนู + บล็อก render ใน App.tsx
 * ฝั่ง backend ยังต้อง enforce สิทธิ์เหมือนเดิม
 */

function normRole(role: string | undefined): AdminRole | "" {
  return (role || "").toUpperCase() as AdminRole | "";
}

/** โมดูลการเงิน / การจ่าย / คอนฟิกเกตเวย์ — ไม่ให้ SUPPORT / DEVELOPER */
const FINANCIAL_AND_PAYOUT = new Set<string>([
  "financial-audit",
  "procurement-compliance",
  "financial-dashboard",
  "tax-identity",
  "provider-wht-review",
  "tax-monthly-pack",
  "etax-readiness",
  "payment-provider-gate",
  "finance-runtime-settings",
  "fare-pricing",
  "wallet-liquidity",
  "manual-deposits",
  "personal-settlement-manual",
  "aqond-gateway-console",
  "insurance-manager",
  "insurance-claims",
  "prb-orders",
  "gold-lotto",
  "beauty-bookings",
  "food-merchant-os",
  "stability-fund",
  "user-payouts",
  "payout-reconciliation",
  "revenue-dashboard",
  "marketplace-commission",
  "financial-strategy",
  "director-welfare",
  "partner-api",
]);

/** ผู้ใช้ฝ่ายสนับสนุน — ไม่เห็น audit log ระบบ / รายงานส่งออกที่อ่อนไหว */
const SUPPORT_EXTRA_DENY = new Set<string>([
  "staff-management",
  "audit-logs",
  "reports",
  "security-center",
]);

/** ผู้ตรวจ — อ่านได้หลายโมดูลการเงิน แต่ไม่แก้คอนฟิกรางเงิน / เกตเวย์ / ราคา */
const AUDITOR_CONFIG_DENY = new Set<string>([
  "staff-management",
  "finance-runtime-settings",
  "payment-provider-gate",
  "personal-settlement-manual",
  "fare-pricing",
  "aqond-gateway-console",
  "director-welfare",
  "settings",
]);

/**
 * @param permissions optional capabilities from session (STAFF_KYC)
 */
export function canAccessAdminView(
  viewId: string,
  role: string | undefined,
  permissions?: string[] | undefined,
): boolean {
  const r = normRole(role);
  if (!r) return false;
  if (r === "SUPER_ADMIN") return true;

  const perms = Array.isArray(permissions) ? permissions.map(String) : [];

  /** ทีม KYC — ค่าเริ่มต้น: แดชบอร์ด + ผู้ใช้ + KYC เท่านั้น */
  if (r === "STAFF_KYC") {
    const baseKyc = new Set([
      "dashboard",
      "users",
      "kyc-review",
      "anti-bypass",
      "app-config",
      "support-center",
      "support-cases",
      "docs",
      "integration-help",
    ]);
    if (baseKyc.has(viewId)) return true;
    if (perms.includes("FINANCIAL_AUDIT_READ")) {
      if (viewId === "financial-audit" || viewId === "financial-dashboard")
        return true;
    }
    if (
      perms.includes("PAYOUT_QUEUE_VIEW") ||
      perms.includes("PAYOUT_APPROVE")
    ) {
      if (viewId === "user-payouts") return true;
    }
    return false;
  }

  /** จัดการสตาฟ — SUPER_ADMIN (ข้างบน) หรือ ADMIN เท่านั้น */
  if (viewId === "staff-management") return r === "ADMIN";

  /** ส่งอีเมลถึงผู้ใช้จาก backend — SUPER_ADMIN เท่านั้น */
  if (viewId === "email-broadcast") return false;

  if (r === "SUPPORT") {
    if (FINANCIAL_AND_PAYOUT.has(viewId)) return false;
    if (SUPPORT_EXTRA_DENY.has(viewId)) return false;
    return true;
  }

  if (r === "DEVELOPER") {
    if (FINANCIAL_AND_PAYOUT.has(viewId)) return false;
    if (viewId === "staff-management") return false;
    return true;
  }

  if (r === "AUDITOR") {
    if (AUDITOR_CONFIG_DENY.has(viewId)) return false;
    return true;
  }

  /** ADMIN, ACCOUNTANT และ role อื่นที่ backend อาจส่งมา */
  return true;
}

export const DEFAULT_SAFE_VIEW = "dashboard";
