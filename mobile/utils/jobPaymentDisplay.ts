import type { Job } from "../types";

export type JobPaymentBadgeVariant = "cash" | "wallet" | "online";

/**
 * Best-effort payment method for provider-facing badges (LINE MAN–style cash vs online).
 */
export function getJobPaymentBadgeVariant(job: Job | null): {
  variant: JobPaymentBadgeVariant;
} | null {
  if (!job) return null;
  const pd = job.payment_details as Record<string, unknown> | undefined;
  const raw =
    (pd?.payment_method as string) ||
    (pd?.pay_method as string) ||
    (job as { payment_method?: string }).payment_method ||
    "";
  const s = String(raw).toLowerCase().trim();
  if (!s) {
    return { variant: "online" };
  }
  if (s.includes("cash") || s === "cod" || s.includes("เงินสด")) {
    return { variant: "cash" };
  }
  if (s.includes("wallet") || s.includes("balance") || s.includes("วอลเล็ต")) {
    return { variant: "wallet" };
  }
  return { variant: "online" };
}
