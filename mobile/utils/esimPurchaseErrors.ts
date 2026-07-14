/**
 * Parse axios/API errors from POST /v1/telecom/purchase-esim (e.g. 402 insufficient balance).
 */

export function parseEsimPurchaseError(e: unknown): {
  message: string;
  insufficient?: boolean;
  required?: number;
  balance?: number;
} {
  const err = e as {
    response?: {
      status?: number;
      data?: { error?: string; required?: number; balance?: number };
    };
    message?: string;
  };
  const status = err?.response?.status;
  const d = err?.response?.data;
  if (status === 402 && d) {
    return {
      message: typeof d.error === "string" ? d.error : "ยอด Wallet ไม่พอสำหรับรายการนี้",
      insufficient: true,
      required: typeof d.required === "number" ? d.required : undefined,
      balance: typeof d.balance === "number" ? d.balance : undefined,
    };
  }
  const msg =
    (typeof d?.error === "string" && d.error) ||
    (typeof err?.message === "string" && err.message) ||
    "ไม่สามารถซื้อได้";
  return { message: msg };
}
