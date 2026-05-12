// pages/Payment.tsx - Updated for Phase 3 Payment Gateway Integration
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useNavigate, Link, useLocation } from "react-router-dom";
import { api } from "../services/api";
import { BackendPaymentService, parsePaymentRateLimitError } from "../services/backendPaymentService";
import paymentGatewayService, {
  PaymentGateway,
  PaymentStatus as GatewayPaymentStatus,
  PAYMENT_FEE,
} from "../services/paymentGatewayService";
import { MockApi } from "../services/mockApi";
import {
  recordPaymentCreated,
  recordPaymentCompleted,
} from "../services/ledgerService";
import { Job, PaymentMethod } from "../types";
import { useLanguage } from "../context/LanguageContext";
import { useAuth } from "../context/AuthContext";
import { useNotification } from "../context/NotificationContext";
import { useMobileAppConfig } from "../context/MobileAppConfigContext";
import {
  CreditCard,
  QrCode,
  Wallet,
  CheckCircle,
  Loader2,
  AlertCircle,
  User,
  Calendar,
  Lock,
  Tag,
  Receipt,
  Shield,
  Clock,
} from "lucide-react";
import { ServiceGuaranteeBadge } from "../components/ServiceGuaranteeBadge";
import { PaymentBreakdown } from "../components/PaymentBreakdown";
import { StripePaymentSection } from "../components/StripePaymentSection";
import { playAqondSuccessSound } from "../utils/aqondPaymentSound";
import {
  MEERAK_PAYMENT_CHANNEL_KEY,
  readStoredPaymentChannel,
  type StoredPaymentChannelId,
} from "../config/paymentChannelStorage";
import {
  fetchPaymentChannels,
  type PaymentChannelsAvailability,
} from "../services/paymentChannelsService";
import {
  fetchMyPromoVouchers,
  usePromoVoucherOnPayment,
  computeAppliedPromoDiscountThb,
  isVoucherAllowedForJobCategory,
  type UserPromoVoucher,
} from "../services/promoVoucherService";
import {
  describeUxPollingStatus,
  paymentConfirmedViaServerFootnote,
  pickUxFailureMessage,
  pollTimeoutUserMessage,
  rateLimitedCreatePaymentMessage,
  shouldDiscardStaleUxPayment,
  isTerminalUxPaymentStatus,
  type UxPaymentCanonical,
} from "../services/uxPaymentResponse";

const CHANNEL_LABEL: Record<StoredPaymentChannelId, string> = {
  promptpay: "PromptPay",
  truemoney: "TrueMoney",
  shopeepay: "ShopeePay",
  stripe: "บัตร (Stripe)",
};

const MEERAK_SESSION_PAYMENT_REF = "meerak_session_payment_client_ref";

/** Stable correlation id for duplicate-safe payment create — persisted per job + session fallback (Task 17). */
function getStableClientReferenceForJob(jobId: string): string {
  try {
    const k = `meerak_pay_cref:${jobId}`;
    const existing = sessionStorage.getItem(k);
    if (existing) return existing;
    let sess = sessionStorage.getItem(MEERAK_SESSION_PAYMENT_REF);
    if (!sess) {
      sess = crypto.randomUUID();
      sessionStorage.setItem(MEERAK_SESSION_PAYMENT_REF, sess);
    }
    sessionStorage.setItem(k, sess);
    return sess;
  } catch {
    return crypto.randomUUID();
  }
}

export const Payment: React.FC = () => {
  const { jobId } = useParams<{ jobId: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { t, language } = useLanguage();
  const { user, login, token } = useAuth();
  const { notify } = useNotification();
  const { config: mobileAppConfig } = useMobileAppConfig();

  const [job, setJob] = useState<Job | null>(null);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [method, setMethod] = useState<PaymentMethod>(PaymentMethod.PROMPTPAY);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [qrCodeUrl, setQrCodeUrl] = useState<string | null>(null);

  // Voucher State — ใช้โค้ดที่รับจากแบนเนอร์แล้ว (GET /vouchers/my); หักจริงหลังชำระสำเร็จ (POST /vouchers/use)
  const [voucherCode, setVoucherCode] = useState("");
  const [discount, setDiscount] = useState(0);
  const [voucherApplied, setVoucherApplied] = useState(false);
  const [myVouchers, setMyVouchers] = useState<UserPromoVoucher[]>([]);
  const [vouchersLoading, setVouchersLoading] = useState(false);
  /** เก็บ voucher + ยอดที่จะหักเมื่อชำระสำเร็จ (ไม่หักตอนกด Apply) */
  const promoRedeemRef = useRef<{ voucherId: string; amountThb: number } | null>(null);

  // Payment Status
  const [paymentStatus, setPaymentStatus] = useState<any>(null);
  /** Task 16: canonical backend `ux` snapshot (GET /api/payments/status) — never infer from provider names. */
  const [canonicalUx, setCanonicalUx] = useState<UxPaymentCanonical | null>(null);
  const [transactionId, setTransactionId] = useState<string>("");
  const [showReceipt, setShowReceipt] = useState(false);
  const [receiptUrl, setReceiptUrl] = useState<string>("");
  const [autotestMode, setAutotestMode] = useState(false);
  const [insuranceRatePercent, setInsuranceRatePercent] = useState(10);
  const [breakdown, setBreakdown] = useState<{
    jobFee: number;
    handlingFeeAmount: number;
    paymentMarkupAmount: number;
    commissionFeeAmount: number;
    talentReceives: number;
    totalToPay: number;
    has_insurance?: boolean;
    insurance_amount?: number;
  } | null>(null);
  const [selectedChannel, setSelectedChannel] = useState<StoredPaymentChannelId | null>(null);
  const [paymentChannels, setPaymentChannels] = useState<PaymentChannelsAvailability | null>(null);

  const redeemPromoAfterSuccess = useCallback(
    async (jid: string) => {
      const pending = promoRedeemRef.current;
      promoRedeemRef.current = null;
      if (!pending || pending.amountThb <= 0) return;
      try {
        await usePromoVoucherOnPayment({
          voucherId: pending.voucherId,
          amountThb: pending.amountThb,
          jobId: jid,
        });
      } catch (e) {
        promoRedeemRef.current = pending;
        console.error("redeemPromoAfterSuccess:", e);
        notify(
          language === "th"
            ? "ชำระเงินสำเร็จ แต่บันทึกการใช้โค้ดส่วนลดไม่สำเร็จ — ติดต่อซัพพอร์ตพร้อมหมายเลขงาน"
            : "Payment succeeded but promo could not be recorded — contact support with job id",
          "warning",
        );
      }
    },
    [notify, language],
  );

  useEffect(() => {
    if (!user || !token || !mobileAppConfig.featureFlags.enablePromoVouchers) {
      setMyVouchers([]);
      return;
    }
    let cancelled = false;
    setVouchersLoading(true);
    fetchMyPromoVouchers()
      .then((list) => {
        if (!cancelled) setMyVouchers(list);
      })
      .catch(() => {
        if (!cancelled) setMyVouchers([]);
      })
      .finally(() => {
        if (!cancelled) setVouchersLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [user, token, mobileAppConfig.featureFlags.enablePromoVouchers]);

  const methodOptions = useMemo(() => {
    return Object.values(PaymentMethod).filter((pm) => {
      if (!paymentChannels) return true;
      if (pm === PaymentMethod.PROMPTPAY) return paymentChannels.job_checkout.promptpay_local_enabled;
      if (pm === PaymentMethod.CREDIT_CARD) return paymentChannels.job_checkout.stripe_card_enabled;
      return true;
    });
  }, [paymentChannels]);

  // ค้างติ๊กประกัน: อ่านจาก localStorage ( sync กับ JobDetails )
  const hasInsurance = (() => {
    if (!jobId) return false;
    try { return localStorage.getItem(`job_insurance_${jobId}`) === 'true'; } catch { return false; }
  })();

  useEffect(() => {
    if (!mobileAppConfig.featureFlags.enablePayments) {
      navigate("/", { replace: true, state: { featureDisabled: "payments" as const } });
    }
  }, [mobileAppConfig.featureFlags.enablePayments, navigate]);

  useEffect(() => {
    fetchPaymentChannels()
      .then(setPaymentChannels)
      .catch(() => setPaymentChannels(null));
  }, []);

  useEffect(() => {
    if (!paymentChannels) return;
    if (method === PaymentMethod.PROMPTPAY && !paymentChannels.job_checkout.promptpay_local_enabled) {
      setMethod(PaymentMethod.WALLET);
    }
    if (method === PaymentMethod.CREDIT_CARD && !paymentChannels.job_checkout.stripe_card_enabled) {
      setMethod(PaymentMethod.WALLET);
    }
  }, [paymentChannels, method]);

  useEffect(() => {
    const loadJobAndPaymentStatus = async () => {
      if (!jobId) return;

      try {
        // 1. โหลดข้อมูลงาน
        const jobData = await MockApi.getJobDetails(jobId);
        setJob(jobData || null);

        // 2. ตรวจสอบสถานะการชำระเงินจาก Backend
        if (jobData) {
          const hi = (() => { try { return localStorage.getItem(`job_insurance_${jobId}`) === 'true'; } catch { return false; } })();
          const [status, breakdownRes] = await Promise.all([
            BackendPaymentService.getPaymentStatus(jobId),
            BackendPaymentService.getPaymentBreakdown(jobId, 0, hi).catch(() => null),
          ]);
          setPaymentStatus(status);
          setBreakdown(breakdownRes);

          // ถ้าชำระเงินสำเร็จแล้ว (backend ใช้ payment_status = paid)
          if (status.paid === true || status.status === "paid" || status.status === "completed") {
            setSuccess(true);
            setTransactionId((status as { transactionId?: string }).transactionId || "");

            // โหลดใบเสร็จ
            try {
              const receipt =
                await BackendPaymentService.generateReceipt(jobId);
              setReceiptUrl(receipt);
            } catch (error) {
              console.warn("Could not load receipt:", error);
            }
          }
        }
      } catch (error) {
        console.error("Failed to load payment data:", error);
        notify(t("common.error_loading"), "error");
      } finally {
        setLoading(false);
      }
    };

    loadJobAndPaymentStatus();
  }, [jobId, notify, t]);

  // ซิงค์ช่องทางที่บันทึกจากหน้า "เลือกช่องทางชำระเงิน" (รันทุกครั้งที่กลับเข้าหน้านี้)
  useEffect(() => {
    const ch = readStoredPaymentChannel();
    if (!ch) return;
    setSelectedChannel(ch);
    if (ch === "stripe") setMethod(PaymentMethod.CREDIT_CARD);
    else setMethod(PaymentMethod.PROMPTPAY);
  }, [jobId, location.pathname]);

  const applyMethodChoice = (pm: PaymentMethod) => {
    setMethod(pm);
    try {
      if (pm === PaymentMethod.PROMPTPAY) {
        sessionStorage.setItem(MEERAK_PAYMENT_CHANNEL_KEY, "promptpay");
        setSelectedChannel("promptpay");
      } else if (pm === PaymentMethod.CREDIT_CARD) {
        sessionStorage.setItem(MEERAK_PAYMENT_CHANNEL_KEY, "stripe");
        setSelectedChannel("stripe");
      } else {
        sessionStorage.removeItem(MEERAK_PAYMENT_CHANNEL_KEY);
        setSelectedChannel(null);
      }
    } catch {
      /* ignore */
    }
  };

  // กลับจาก Stripe redirect (Apple/Google Pay / 3DS) — HashRouter: query อยู่หลัง #
  useEffect(() => {
    if (!jobId) return;
    const hash = window.location.hash || "";
    const qi = hash.indexOf("?");
    const q = qi >= 0 ? hash.slice(qi + 1) : "";
    const params = new URLSearchParams(q);
    if (params.get("stripe_done") !== "1") return;
    let cancelled = false;
    (async () => {
      const deadline = Date.now() + 90_000;
      while (!cancelled && Date.now() < deadline) {
        try {
          const st = await BackendPaymentService.getPaymentStatus(jobId);
          if (st.paid === true || st.status === "paid") {
            playAqondSuccessSound();
            await redeemPromoAfterSuccess(jobId);
            setSuccess(true);
            try {
              const receipt = await BackendPaymentService.generateReceipt(jobId);
              setReceiptUrl(receipt);
            } catch {
              /* optional */
            }
            const baseHash = window.location.hash.split("?")[0] || `#/payment/${jobId}`;
            window.history.replaceState({}, "", `${window.location.pathname}${baseHash}`);
            return;
          }
        } catch {
          /* retry */
        }
        await new Promise((r) => setTimeout(r, 1500));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [jobId, redeemPromoAfterSuccess]);

  // โหลด breakdown ใหม่เมื่อ discount หรือ hasInsurance เปลี่ยน
  useEffect(() => {
    if (!jobId || !job) return;
    const hi = (() => { try { return localStorage.getItem(`job_insurance_${jobId}`) === 'true'; } catch { return false; } })();
    BackendPaymentService.getPaymentBreakdown(jobId, discount, hi)
      .then(setBreakdown)
      .catch(() => setBreakdown(null));
  }, [jobId, job, discount]);

  // Remove old QR generation - will be generated by gateway service when payment is created

  const handleApplyVoucher = async () => {
    if (!voucherCode.trim() || !job) return;
    if (!mobileAppConfig.featureFlags.enablePromoVouchers) {
      notify(language === "th" ? "โค้ดส่วนลดถูกปิดชั่วคราว" : "Promo vouchers are disabled", "warning");
      return;
    }
    const code = voucherCode.trim().toUpperCase();
    const v = myVouchers.find((x) => x.promoCode === code && x.remainingBaht > 0);
    if (!v) {
      notify(
        language === "th"
          ? "ไม่พบโค้ดนี้ในบัญชีหรือใช้หมดแล้ว — รับโค้ดจากหน้าแรกก่อน"
          : "No such code in your account or balance is zero — claim from home banner first",
        "error",
      );
      return;
    }
    if (v.promoClaimsEnabled === false) {
      notify(
        language === "th"
          ? "การใช้โค้ดนี้ถูกระงับชั่วคราว — รอแอดมินเปิดอีกครั้ง"
          : "This promo code is temporarily paused by admin",
        "warning",
      );
      return;
    }
    if (!isVoucherAllowedForJobCategory(v, job.category)) {
      notify(
        language === "th"
          ? "โค้ดนี้ใช้ได้เฉพาะหมวดงานที่กำหนด — งานนี้ไม่เข้าเงื่อนไข"
          : "This code applies only to selected job categories",
        "error",
      );
      return;
    }
    const amount = computeAppliedPromoDiscountThb(Number(job.price) || 0, v);
    if (amount <= 0) {
      notify(language === "th" ? "ยอดส่วนลดไม่ถูกต้อง" : "Invalid discount", "error");
      return;
    }
    setDiscount(amount);
    setVoucherApplied(true);
    promoRedeemRef.current = { voucherId: v.id, amountThb: amount };
    notify(
      language === "th"
        ? "ใช้ส่วนลดแล้ว — จะหักเมื่อชำระเงินสำเร็จ"
        : "Discount applied — redeeming when payment completes",
      "success",
    );
  };

  const handleStripeFlowComplete = async () => {
    playAqondSuccessSound();
    if (jobId) {
      await redeemPromoAfterSuccess(jobId);
      try {
        const receipt = await BackendPaymentService.generateReceipt(jobId);
        setReceiptUrl(receipt);
      } catch {
        /* optional */
      }
      setTransactionId(`STRIPE-${String(jobId).slice(-10)}`);
    }
    setSuccess(true);
  };

  const handlePayment = async () => {
    if (!job || !user) return;

    if (method === PaymentMethod.CREDIT_CARD) {
      notify("ใช้ปุ่มในฟอร์ม Stripe ด้านบนเพื่อชำระเงิน", "info");
      return;
    }

    setProcessing(true);
    setError(null);
    setQrCodeUrl(null);

    try {
      const amountToCharge = displayBreakdown.totalToPay;

      // Map PaymentMethod to PaymentGateway (PromptPay = 3-5 THB fee; Card = 19 THB)
      let gateway: PaymentGateway;
      if (method === PaymentMethod.PROMPTPAY) {
        gateway = PaymentGateway.PROMPTPAY;
      } else if (method === PaymentMethod.CREDIT_CARD) {
        gateway = PaymentGateway.STRIPE;
      } else {
        gateway = PaymentGateway.PROMPTPAY;
      }

      let paymentResult: Awaited<
        ReturnType<typeof paymentGatewayService.createPayment>
      >;

      if (autotestMode && gateway === PaymentGateway.PROMPTPAY) {
        paymentResult = paymentGatewayService.createPromptPayPaymentTest(
          amountToCharge,
          job.id,
          { user_id: user.id, job_title: job.title },
        );
      } else {
        const hasInsuranceForApi = (() => {
          try {
            return localStorage.getItem(`job_insurance_${job.id}`) === "true";
          } catch {
            return false;
          }
        })();

        paymentResult = await paymentGatewayService.createPayment({
          job_id: job.id,
          amount: amountToCharge,
          gateway: gateway,
          metadata: {
            user_id: user.id,
            user_name: user.name || user.email,
            job_title: job.title,
            job_category: job.category,
            client_reference_id: getStableClientReferenceForJob(job.id),
            discount_amount: discount,
            has_insurance: hasInsuranceForApi,
          },
        });
      }

      if (!paymentResult.success) {
        throw new Error(paymentResult.error || "Payment creation failed");
      }

      const reusedActive = !!(paymentResult as { reused_duplicate_active?: boolean }).reused_duplicate_active;

      // Phase 3: Append to immutable ledger (payment_created) — skip on server-side duplicate reuse (no extra append)
      if (!reusedActive) {
        const ledgerGateway:
          | "promptpay"
          | "stripe"
          | "truemoney"
          | "wallet"
          | "bank_transfer" =
          gateway === PaymentGateway.PROMPTPAY
            ? selectedChannel === "truemoney"
              ? "truemoney"
              : selectedChannel === "shopeepay"
                ? "wallet"
                : "promptpay"
            : gateway === PaymentGateway.STRIPE
              ? "stripe"
              : "truemoney";
        try {
          await recordPaymentCreated({
            payment_id: paymentResult.payment_id,
            gateway: ledgerGateway,
            job_id: job.id,
            amount: amountToCharge,
            currency: paymentResult.currency || "THB",
            bill_no: paymentResult.bill_no,
            transaction_no: paymentResult.transaction_no,
            user_id: user.id,
            metadata: { job_title: job.title },
          });
        } catch (ledgerErr) {
          console.warn(
            "Ledger recordPaymentCreated failed (non-blocking):",
            ledgerErr,
          );
        }
      }

      setTransactionId(paymentResult.transaction_no);

      // 2. Handle based on gateway type
      if (gateway !== PaymentGateway.STRIPE) {
        // Display QR code from gateway
        if (paymentResult.qr_code_url) {
          setQrCodeUrl(paymentResult.qr_code_url);
        }

        notify(
          language === "th"
            ? "สร้าง QR แล้ว — เมื่อสแกนจ่าย สถานะจะอัปเดตเมื่อเซิร์ฟเวอร์ยืนยันกับผู้ให้บริการ"
            : "QR ready — status updates once our servers confirm with your provider",
          "info",
        );

        // 3. Poll gateway + canonical job UX (honor poll_after_ms + backoff when snapshot unchanged — no client webhook verify).
        try {
          let status: GatewayPaymentStatus;
          if (autotestMode && paymentResult.payment_id.startsWith("pp_test_")) {
            await new Promise((r) => setTimeout(r, 2500));
            status = paymentGatewayService.checkPaymentStatusTest(
              paymentResult.payment_id,
            );
          } else {
            let lastUxVersion = 0;
            const maxAttempts = 60;
            status = GatewayPaymentStatus.PENDING;
            let resolved = false;
            let uxUnchangedStreak = 0;
            let lastUxFp = "";
            for (let attempt = 0; attempt < maxAttempts; attempt++) {
              let waitMs = 4000;
              const jobSt = await BackendPaymentService.getPaymentStatus(job.id);
              const ux = jobSt?.ux;
              const langUi = language === "th" ? "th" : "en";
              if (ux && typeof ux.status_version === "number") {
                const fp = `${ux.status}:${ux.status_version}`;
                if (fp === lastUxFp) uxUnchangedStreak += 1;
                else {
                  uxUnchangedStreak = 0;
                  lastUxFp = fp;
                }
                if (!shouldDiscardStaleUxPayment(lastUxVersion, ux.status_version)) {
                  lastUxVersion = Math.max(lastUxVersion, ux.status_version);
                  setCanonicalUx(ux);
                }
                if (typeof ux.poll_after_ms === "number" && ux.poll_after_ms > 0) {
                  waitMs = ux.poll_after_ms;
                }
                if (uxUnchangedStreak >= 3) {
                  waitMs = Math.min(Math.round(waitMs * 1.2 + 1200), 12000);
                }
                if (ux.status === "completed") {
                  status = GatewayPaymentStatus.COMPLETED;
                  resolved = true;
                  break;
                }
                if (
                  ux.status === "failed" ||
                  ux.status === "expired" ||
                  ux.status === "reversed" ||
                  ux.status === "manual_review"
                ) {
                  const hint = pickUxFailureMessage(ux, langUi);
                  throw new Error(hint || `Payment ${ux.status}`);
                }
              }
              try {
                const gwRow = await paymentGatewayService.checkPaymentStatus(
                  paymentResult.payment_id,
                  gateway,
                );
                if (gwRow?.status === GatewayPaymentStatus.COMPLETED) {
                  status = GatewayPaymentStatus.COMPLETED;
                  resolved = true;
                  break;
                }
                if (
                  gwRow?.status === GatewayPaymentStatus.FAILED ||
                  gwRow?.status === GatewayPaymentStatus.EXPIRED
                ) {
                  throw new Error(`Payment ${gwRow.status}`);
                }
              } catch (gwErr: unknown) {
                const msg = gwErr instanceof Error ? gwErr.message : String(gwErr ?? "");
                if (
                  msg.includes("Failed to check") ||
                  msg.includes("NETWORK") ||
                  msg.toLowerCase().includes("network")
                ) {
                  // Transient gateway read — keep polling canonical UX until terminal or timeout
                  console.warn("Gateway status check transient failure:", gwErr);
                } else {
                  throw gwErr;
                }
              }
              if (attempt === maxAttempts - 1) break;
              await new Promise((r) => setTimeout(r, waitMs));
            }
            if (!resolved && status !== GatewayPaymentStatus.COMPLETED) {
              throw new Error(pollTimeoutUserMessage(language === "th" ? "th" : "en"));
            }
          }

          if (status === GatewayPaymentStatus.COMPLETED) {
            // Phase 3: Append to immutable ledger (payment_completed)
            try {
              await recordPaymentCompleted({
                payment_id: paymentResult.payment_id,
                gateway: ledgerGateway,
                job_id: job.id,
                amount: amountToCharge,
                currency: paymentResult.currency || "THB",
                bill_no: paymentResult.bill_no,
                transaction_no: paymentResult.transaction_no,
                user_id: user.id,
                provider_id: job.accepted_by || undefined,
                metadata: { job_title: job.title },
              });
            } catch (ledgerErr) {
              console.warn(
                "Ledger recordPaymentCompleted failed (non-blocking):",
                ledgerErr,
              );
            }
            await redeemPromoAfterSuccess(job.id);
            // Payment successful
            setSuccess(true);
            notify(t("payment.success_title"), "success");

            // Generate receipt
            const receipt = await BackendPaymentService.generateReceipt(job.id);
            setReceiptUrl(receipt);
          } else {
            throw new Error(`Payment ${status}`);
          }
        } catch (pollError: any) {
          throw new Error(pollError.message || "Payment verification timeout");
        }
      } else if (gateway === PaymentGateway.STRIPE) {
        notify("ใช้ฟอร์ม Stripe ด้านบน", "info");
      }

      // 4. Update user wallet balance (if wallet payment)
      if (method === PaymentMethod.WALLET && user) {
        const updatedUser = {
          ...user,
          wallet_balance: (user.wallet_balance || 0) - amountToCharge,
        };
        login(updatedUser, token || "");
      }
    } catch (error: unknown) {
      console.error("Payment processing failed:", error);

      const rl = parsePaymentRateLimitError(error);
      if (rl != null) {
        const langUi = language === "th" ? "th" : "en";
        const msg = rateLimitedCreatePaymentMessage(rl.retryAfterSec, langUi);
        setError(msg);
        notify(msg, "warning");
        setProcessing(false);
        return;
      }

      const ax = error as { response?: { data?: { error?: string }; status?: number } };
      const errorMessage =
        (typeof ax?.response?.data?.error === "string" && ax.response.data.error) ||
        (error instanceof Error ? error.message : null) ||
        (language === "th"
          ? "การชำระเงินไม่สำเร็จ — ลองใหม่หรือติดต่อสนับสนุนพร้อมหมายเลขงาน"
          : "Payment didn’t finish — retry or contact support with the job ID.");

      setError(errorMessage);
      notify(language === "th" ? "การชำระเงินไม่สำเร็จ" : "Payment did not succeed", "error");
    } finally {
      setProcessing(false);
    }
  };

  const handleViewReceipt = async () => {
    if (!jobId) return;

    try {
      if (!receiptUrl) {
        const receipt = await BackendPaymentService.generateReceipt(jobId);
        setReceiptUrl(receipt);
      }
      setShowReceipt(true);
    } catch (error) {
      notify("Failed to load receipt", "error");
    }
  };

  const handleDownloadReceipt = () => {
    if (receiptUrl) {
      const link = document.createElement("a");
      link.href = receiptUrl;
      link.download = `receipt-${transactionId}.pdf`;
      link.click();
    }
  };

  if (loading) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center">
        <div className="w-16 h-16 border-4 border-emerald-200 border-t-emerald-600 rounded-full animate-spin mb-4"></div>
        <p className="text-gray-500">{t("common.loading")}</p>
      </div>
    );
  }

  if (!job) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center text-center px-4">
        <AlertCircle className="w-16 h-16 text-red-400 mb-4" />
        <h2 className="text-xl font-bold text-gray-900 mb-2">
          {t("detail.not_found")}
        </h2>
        <button
          onClick={() => navigate("/")}
          className="mt-4 px-6 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors"
        >
          {t("common.back_home")}
        </button>
      </div>
    );
  }

  const jobFee = Math.max(0, job.price - discount);
  const displayBreakdown = breakdown ?? (() => {
    const rate = insuranceRatePercent / 100;
    const ins = hasInsurance ? Math.round(jobFee * rate * 100) / 100 : 0;
    const base = jobFee + ins;
    const markup = Math.round(base * 0.05 * 100) / 100;
    const totalToPay = Math.round(base * 1.05 * 100) / 100;
    const handling = Math.round(jobFee * 0.08 * 100) / 100;
    const commission = Math.round(jobFee * 0.24 * 100) / 100;
    const taxService = Math.round((handling + commission) * 0.03 * 100) / 100;
    const talentReceives = Math.round((jobFee - handling - commission - taxService) * 100) / 100;
    return {
      jobFee,
      handlingFeeAmount: handling,
      paymentMarkupAmount: markup,
      commissionFeeAmount: commission,
      talentReceives,
      totalToPay,
      has_insurance: hasInsurance,
      insurance_amount: ins,
    };
  })();

  if (success) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center text-center px-4 max-w-md mx-auto">
        <div className="w-24 h-24 bg-gradient-to-br from-emerald-100 to-green-100 rounded-full flex items-center justify-center mb-6 animate-bounce">
          <CheckCircle size={48} className="text-emerald-600" />
        </div>

        <div className="mb-2">
          <h2 className="text-2xl font-bold text-gray-900">
            {t("payment.success_title")}
          </h2>
          <p className="text-gray-500 mt-2">{t("payment.success_desc")}</p>
        </div>

        <div id="receipt-print-area" className="bg-gradient-to-br from-gray-50 to-white rounded-2xl p-6 w-full mb-8 border border-gray-100 shadow-sm">
          <h3 className="font-bold text-gray-900 mb-4">ใบเสร็จการชำระเงิน</h3>
          <div className="space-y-2 text-sm mb-4">
            <div className="flex justify-between">
              <span className="text-gray-600">ค่าจ้างงาน</span>
              <span className="font-mono">฿ {displayBreakdown.jobFee.toLocaleString()}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">ค่าจัดหา (8%)</span>
              <span className="font-mono">฿ {displayBreakdown.handlingFeeAmount.toLocaleString()}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">ค่าบริการระบบชำระเงิน (5%)</span>
              <span className="font-mono">฿ {displayBreakdown.paymentMarkupAmount.toLocaleString()}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">ค่าคอมมิชชั่นแพลตฟอร์ม</span>
              <span className="font-mono">฿ {displayBreakdown.commissionFeeAmount.toLocaleString()}</span>
            </div>
            {(displayBreakdown as any).insurance_amount > 0 && (
              <div className="flex justify-between">
                <span className="text-gray-600">เบี้ยประกันงาน ({insuranceRatePercent}%)</span>
                <span className="font-mono">฿ {(displayBreakdown as any).insurance_amount.toLocaleString()}</span>
              </div>
            )}
            <div className="border-t border-gray-200 pt-2 mt-2 flex justify-between">
              <span className="text-emerald-600 font-medium">ยอดที่ Talent ได้รับ</span>
              <span className="font-mono font-bold text-emerald-600">฿ {displayBreakdown.talentReceives.toLocaleString()}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-amber-600 font-medium">ยอดที่ชำระ</span>
              <span className="font-mono font-bold text-amber-600 text-lg">฿ {displayBreakdown.totalToPay.toLocaleString()}</span>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4 mb-4">
            <div className="text-left">
              <p className="text-xs text-gray-500 uppercase tracking-wider font-medium mb-1">
                Amount Paid
              </p>
              <p className="font-bold text-gray-900 text-lg">
                {displayBreakdown.totalToPay} THB
              </p>
            </div>
            <div className="text-right">
              <p className="text-xs text-gray-500 uppercase tracking-wider font-medium mb-1">
                Method
              </p>
              <p className="font-medium text-gray-900 uppercase text-sm">
                {method.replace("_", " ")}
              </p>
            </div>
          </div>

          <div className="border-t border-gray-100 pt-4 space-y-2">
            <div>
              <p className="text-xs text-gray-500 uppercase tracking-wider font-medium mb-1">วันที่ชำระ</p>
              <p className="font-mono text-sm text-gray-700">{new Date().toLocaleString("th-TH")}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500 uppercase tracking-wider font-medium mb-1">หมายเลขอ้างอิง</p>
              <p className="font-mono text-sm text-gray-700 bg-gray-50 px-3 py-2 rounded-lg">
                {transactionId || `TX-${Date.now().toString().slice(-8)}`}
              </p>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            {receiptUrl && (
              <>
                <button
                  onClick={handleViewReceipt}
                  className="flex-1 min-w-[120px] px-4 py-2 bg-emerald-50 text-emerald-700 rounded-lg font-medium hover:bg-emerald-100 transition-colors flex items-center justify-center"
                >
                  <Receipt size={18} className="mr-2" />
                  ดูใบเสร็จ
                </button>
                <button
                  onClick={handleDownloadReceipt}
                  className="flex-1 min-w-[120px] px-4 py-2 bg-white text-gray-700 rounded-lg font-medium hover:bg-gray-50 transition-colors border border-gray-200 flex items-center justify-center"
                >
                  Download
                </button>
              </>
            )}
            <button
              onClick={() => window.print()}
              className="flex-1 min-w-[120px] px-4 py-2 bg-amber-50 text-amber-700 rounded-lg font-medium hover:bg-amber-100 transition-colors border border-amber-200 flex items-center justify-center print:hidden"
            >
              พิมพ์ / บันทึก PDF
            </button>
          </div>
        </div>

        <div className="flex gap-3 w-full">
          <button
            onClick={() => navigate(`/job/${jobId}`)}
            className="flex-1 px-6 py-3 bg-gray-100 text-gray-700 rounded-lg font-bold hover:bg-gray-200 transition-colors"
          >
            View Job Details
          </button>
          <button
            onClick={() => navigate("/my-jobs")}
            className="flex-1 px-6 py-3 bg-emerald-600 text-white rounded-lg font-bold hover:bg-emerald-700 transition-colors"
          >
            {t("payment.view_my_jobs")}
          </button>
        </div>

        {showReceipt && receiptUrl && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-hidden">
              <div className="p-4 border-b border-gray-200 flex justify-between items-center">
                <h3 className="font-bold text-gray-900">Payment Receipt</h3>
                <button
                  onClick={() => setShowReceipt(false)}
                  className="text-gray-500 hover:text-gray-700"
                >
                  ✕
                </button>
              </div>
              <div className="p-4 overflow-auto">
                <iframe
                  src={receiptUrl}
                  className="w-full h-[70vh] border-0"
                  title="Payment Receipt"
                />
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2 flex items-center">
          <Shield className="w-8 h-8 text-emerald-600 mr-3" />
          {t("payment.title")}
        </h1>
        <p className="text-gray-500">Complete your payment securely</p>
        {(language === "en" ? mobileAppConfig.remote.paymentNoticeEn : mobileAppConfig.remote.paymentNoticeTh)
          ?.trim() ? (
          <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950 whitespace-pre-wrap">
            {language === "en"
              ? mobileAppConfig.remote.paymentNoticeEn
              : mobileAppConfig.remote.paymentNoticeTh}
          </div>
        ) : null}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left Column - Order Summary */}
        <div className="lg:col-span-1">
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 sticky top-24">
            <div className="flex items-center justify-between mb-6">
              <h3 className="font-bold text-gray-900 text-lg">
                {t("payment.order_summary")}
              </h3>
              <span className="text-xs font-medium px-2 py-1 bg-emerald-100 text-emerald-700 rounded-full">
                {job.status}
              </span>
            </div>

            <div className="space-y-4 mb-6">
              <div>
                <h4 className="font-medium text-gray-900 mb-1">{job.title}</h4>
                <p className="text-sm text-gray-500">
                  {job.description?.substring(0, 100)}...
                </p>
              </div>

              {discount > 0 && (
                <div className="flex justify-between text-sm mb-3">
                  <span className="text-emerald-600 font-medium">Discount</span>
                  <span className="font-bold text-emerald-600">-{discount} THB</span>
                </div>
              )}

              <PaymentBreakdown
                jobFee={displayBreakdown.jobFee}
                handlingFeeAmount={displayBreakdown.handlingFeeAmount}
                paymentMarkupAmount={displayBreakdown.paymentMarkupAmount}
                commissionFeeAmount={displayBreakdown.commissionFeeAmount}
                talentReceives={displayBreakdown.talentReceives}
                totalToPay={displayBreakdown.totalToPay}
                insuranceAmount={(displayBreakdown as any).insurance_amount || 0}
                mode="match"
                variant="light"
                showBenefits={true}
                showComparison={true}
                className="mb-4"
              />

              <ServiceGuaranteeBadge className="mt-4" />
            </div>

            {/* Voucher Section — โค้ดจากแบนเนอร์ (รับที่หน้าแรก) หักจริงหลังชำระสำเร็จ */}
            {mobileAppConfig.featureFlags.enablePromoVouchers ? (
            <div className="border-t border-gray-100 pt-6">
              <label className="block text-sm font-medium text-gray-900 mb-2 flex items-center">
                <Tag className="w-4 h-4 mr-2" />
                {t("payment.voucher")}
              </label>
              <p className="text-xs text-gray-500 mb-2">
                {vouchersLoading
                  ? language === "th"
                    ? "กำลังโหลดโค้ดของคุณ…"
                    : "Loading your vouchers…"
                  : myVouchers.length > 0
                    ? language === "th"
                      ? `มี ${myVouchers.length} โค้ดที่ใช้ได้ — กรอกรหัสแล้วกด Apply`
                      : `${myVouchers.length} voucher(s) available — enter code and Apply`
                    : language === "th"
                      ? "ยังไม่มีโค้ด — ไปหน้าแรกกดรับจากแบนเนอร์ก่อน"
                      : "No vouchers — claim from a banner on Home first"}
              </p>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={voucherCode}
                  onChange={(e) => setVoucherCode(e.target.value.toUpperCase())}
                  placeholder="ENTER CODE"
                  disabled={voucherApplied || vouchersLoading}
                  className="flex-1 px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 transition-all uppercase font-medium disabled:bg-gray-50"
                />
                <button
                  type="button"
                  onClick={() => void handleApplyVoucher()}
                  disabled={!voucherCode.trim() || voucherApplied || vouchersLoading}
                  className="px-4 py-2.5 bg-gray-900 text-white font-medium rounded-lg hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {voucherApplied ? "Applied" : "Apply"}
                </button>
              </div>
              {voucherApplied && (
                <p className="text-sm text-emerald-600 mt-2 flex items-center">
                  <CheckCircle className="w-4 h-4 mr-1" />
                  {language === "th"
                    ? "ใช้ส่วนลดแล้ว — จะหักเมื่อชำระสำเร็จ"
                    : "Discount applied — redeemed when payment completes"}
                </p>
              )}
            </div>
            ) : (
              <div className="border-t border-gray-100 pt-6 text-xs text-amber-800 bg-amber-50 rounded-lg px-3 py-2">
                {language === "th"
                  ? "ระบบโค้ดส่วนลดถูกปิดชั่วคราวโดยผู้ดูแลระบบ"
                  : "Promo vouchers are temporarily disabled by admin."}
              </div>
            )}

            {/* Security Badges */}
            <div className="mt-6 pt-6 border-t border-gray-100 grid grid-cols-2 gap-3">
              <div className="text-center p-3 bg-gray-50 rounded-lg">
                <Shield className="w-6 h-6 text-emerald-600 mx-auto mb-1" />
                <p className="text-xs font-medium text-gray-700">
                  Secure Payment
                </p>
              </div>
              <div className="text-center p-3 bg-gray-50 rounded-lg">
                <Lock className="w-6 h-6 text-emerald-600 mx-auto mb-1" />
                <p className="text-xs font-medium text-gray-700">256-bit SSL</p>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column - Payment Method & Processing */}
        <div className="lg:col-span-2">
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 mb-6">
            <h3 className="font-bold text-gray-900 text-lg mb-2">
              {t("payment.select_method")}
            </h3>
            {paymentChannels && !paymentChannels.job_checkout.payment_gateway_available && (
              <p className="text-sm text-amber-900 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-3">
                {language === "th"
                  ? paymentChannels.messages.th.payment_gateway
                  : paymentChannels.messages.en.payment_gateway}
              </p>
            )}
            {jobId && (
              <div className="flex flex-wrap items-center gap-2 mb-4">
                <Link
                  to={`/payment-methods?returnTo=${encodeURIComponent(`/payment/${jobId}`)}`}
                  className="inline-flex items-center text-sm font-medium text-emerald-700 hover:text-emerald-800 underline underline-offset-2"
                >
                  เลือกช่องทางชำระเงิน (PromptPay · TrueMoney · ShopeePay · บัตร)
                </Link>
                {selectedChannel && (
                  <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800">
                    ช่องทาง: {CHANNEL_LABEL[selectedChannel]}
                  </span>
                )}
              </div>
            )}

            {/* Payment Method Selection */}
            <p className="text-xs text-gray-500 mb-4">
              PromptPay QR: ~{PAYMENT_FEE.PROMPTPAY_THB} THB fee · Card: ~
              {PAYMENT_FEE.CARD_THB} THB fee
            </p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
              {methodOptions.map((pm) => (
                <button
                  key={pm}
                  onClick={() => applyMethodChoice(pm)}
                  className={`p-5 rounded-xl border-2 flex flex-col items-center justify-center transition-all duration-300 ${
                    method === pm
                      ? "border-emerald-500 bg-emerald-50 text-emerald-700 shadow-sm"
                      : "border-gray-100 hover:border-emerald-200 hover:bg-gray-50 text-gray-700"
                  }`}
                >
                  {pm === PaymentMethod.PROMPTPAY && (
                    <QrCode className="w-8 h-8 mb-3" />
                  )}
                  {pm === PaymentMethod.CREDIT_CARD && (
                    <CreditCard className="w-8 h-8 mb-3" />
                  )}
                  {pm === PaymentMethod.WALLET && (
                    <Wallet className="w-8 h-8 mb-3" />
                  )}
                  <span className="font-bold text-sm">
                    {pm === PaymentMethod.PROMPTPAY
                      ? t("payment.promptpay")
                      : pm === PaymentMethod.CREDIT_CARD
                        ? t("payment.credit_card")
                        : t("payment.wallet")}
                  </span>
                  {method === pm && (
                    <div className="w-3 h-3 bg-emerald-500 rounded-full mt-3 animate-pulse"></div>
                  )}
                </button>
              ))}
            </div>

            {/* Payment Details Based on Method */}
            <div className="bg-gradient-to-br from-gray-50 to-white rounded-xl p-6 border border-gray-200 mb-6">
              {method === PaymentMethod.PROMPTPAY && (
                <div className="text-center">
                  <div className="inline-flex items-center px-4 py-2 bg-emerald-100 text-emerald-700 rounded-full mb-6">
                    <Clock className="w-4 h-4 mr-2" />
                    <span className="text-sm font-medium">
                      {language === "th" ? "QR ใช้ได้ประมาณ 15 นาที" : "Valid for ~15 minutes"}
                    </span>
                  </div>

                  <div className="flex flex-col items-center">
                    {qrCodeUrl ? (
                      <>
                        <div className="p-4 bg-white rounded-2xl border-2 border-emerald-100 mb-6 shadow-sm">
                          <img
                            src={qrCodeUrl}
                            alt="PromptPay QR Code"
                            className="w-56 h-56"
                          />
                        </div>
                        <p className="text-sm text-gray-600 mb-4">
                          {language === "th"
                            ? "สแกน QR ด้วยแอปธนาคารของคุณ"
                            : "Scan this QR with your banking app to pay"}
                        </p>
                        {canonicalUx && !isTerminalUxPaymentStatus(canonicalUx.status) ? (
                          <div className="text-xs text-slate-600 mb-2 space-y-1 max-w-xs mx-auto" aria-live="polite">
                            <p>
                              <span className="font-medium text-slate-800">
                                {language === "th" ? "สถานะจากระบบ:" : "Status from AQOND:"}{" "}
                              </span>
                              {describeUxPollingStatus(canonicalUx, language === "th" ? "th" : "en")}
                            </p>
                            <p className="text-[11px] text-slate-500 leading-snug">
                              {paymentConfirmedViaServerFootnote(language === "th" ? "th" : "en")}
                            </p>
                          </div>
                        ) : null}
                      </>
                    ) : (
                      <div className="w-56 h-56 bg-gray-100 rounded-2xl flex items-center justify-center mb-6">
                        <Loader2 className="w-8 h-8 text-gray-400 animate-spin" />
                      </div>
                    )}

                    <div className="bg-gray-900 text-white rounded-xl p-4 w-full max-w-sm">
                      <p className="text-sm opacity-90 mb-1">{language === "th" ? "ยอดชำระ" : "Amount to pay"}</p>
                      <p className="text-3xl font-bold">{displayBreakdown.totalToPay} THB</p>
                      <p className="text-xs opacity-75 mt-2">
                        Ref: {jobId?.slice(-8).toUpperCase()}
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {method === PaymentMethod.CREDIT_CARD && jobId && (
                <StripePaymentSection
                  language={language === "th" ? "th" : "en"}
                  jobId={jobId}
                  discountAmount={discount}
                  hasInsurance={hasInsurance}
                  totalLabel={`${displayBreakdown.totalToPay.toLocaleString()} THB`}
                  onPaid={handleStripeFlowComplete}
                  onError={(msg) => {
                    setError(msg);
                    notify(msg, "error");
                  }}
                  notify={notify}
                />
              )}

              {method === PaymentMethod.WALLET && (
                <div className="text-center py-6">
                  <div className="inline-flex items-center justify-center w-20 h-20 bg-gradient-to-br from-emerald-100 to-green-100 rounded-full mb-4">
                    <Wallet className="w-10 h-10 text-emerald-600" />
                  </div>

                  <div className="mb-6">
                    <p className="text-sm text-gray-600 mb-2">
                      Current Balance
                    </p>
                    <p className="text-4xl font-bold text-gray-900">
                      {user?.wallet_balance?.toLocaleString() || 0}
                      <span className="text-lg text-gray-500 ml-1">THB</span>
                    </p>
                  </div>

                  <div
                    className={`p-4 rounded-xl mb-6 ${
                      (user?.wallet_balance || 0) >= displayBreakdown.totalToPay
                        ? "bg-emerald-50 border border-emerald-100"
                        : "bg-red-50 border border-red-100"
                    }`}
                  >
                    <div className="flex items-center justify-center mb-2">
                      {(user?.wallet_balance || 0) >= displayBreakdown.totalToPay ? (
                        <>
                          <CheckCircle className="w-5 h-5 text-emerald-600 mr-2" />
                          <span className="font-medium text-emerald-700">
                            Sufficient Balance
                          </span>
                        </>
                      ) : (
                        <>
                          <AlertCircle className="w-5 h-5 text-red-600 mr-2" />
                          <span className="font-medium text-red-700">
                            Insufficient Balance
                          </span>
                        </>
                      )}
                    </div>
                    <p className="text-sm text-gray-600">
                      Required: {displayBreakdown.totalToPay} THB | Available:{" "}
                      {user?.wallet_balance || 0} THB
                    </p>
                  </div>

                  {(user?.wallet_balance || 0) < displayBreakdown.totalToPay && (
                    <button
                      onClick={() => navigate("/wallet/topup")}
                      className="w-full py-3 bg-gray-900 text-white font-medium rounded-lg hover:bg-gray-800 transition-colors mb-4"
                    >
                      Top Up Wallet
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Error Display */}
            {error && (
              <div className="bg-red-50 border border-red-100 rounded-xl p-4 mb-6 animate-in fade-in slide-in-from-top-2">
                <div className="flex items-center">
                  <AlertCircle className="w-5 h-5 text-red-600 mr-3 flex-shrink-0" />
                  <div>
                    <p className="font-medium text-red-700 mb-1">
                      {language === "th" ? "ข้อผิดพลาดการชำระเงิน" : "Payment error"}
                    </p>
                    <p className="text-sm text-red-600">{error}</p>
                  </div>
                </div>
              </div>
            )}

            {/* Terms & Conditions */}
            <div className="mb-6">
              <div className="flex items-start">
                <input
                  type="checkbox"
                  id="terms"
                  className="mt-1 mr-3"
                  defaultChecked
                />
                <label htmlFor="terms" className="text-sm text-gray-600">
                  I agree to the Terms of Service and Privacy Policy. I
                  understand that payments are processed securely and refunds
                  are subject to our refund policy.
                </label>
              </div>
            </div>

            {/* Payment Button */}
            <div className="flex flex-col gap-3">
              <button
                onClick={handlePayment}
                disabled={
                  processing ||
                  method === PaymentMethod.CREDIT_CARD ||
                  (method === PaymentMethod.PROMPTPAY && !!qrCodeUrl) ||
                  (method === PaymentMethod.WALLET &&
                    (user?.wallet_balance || 0) < displayBreakdown.totalToPay)
                }
                className="w-full py-4 bg-gradient-to-r from-emerald-600 to-green-600 text-white font-bold rounded-xl hover:from-emerald-700 hover:to-green-700 transition-all duration-300 shadow-lg shadow-emerald-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center text-lg"
              >
                {processing ? (
                  <>
                    <Loader2 className="w-6 h-6 animate-spin mr-3" />
                    {autotestMode
                      ? "Autotest in progress..."
                      : "Processing Payment..."}
                  </>
                ) : (
                  <>
                    {method === PaymentMethod.CREDIT_CARD
                      ? "ชำระผ่านฟอร์ม Stripe ด้านบน"
                      : method === PaymentMethod.PROMPTPAY && qrCodeUrl
                        ? "Waiting for scan..."
                        : `Pay ${displayBreakdown.totalToPay} THB`}
                    <Shield className="w-5 h-5 ml-3" />
                  </>
                )}
              </button>
              {method === PaymentMethod.PROMPTPAY && (
                <label className="flex items-center gap-2 text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                  <input
                    type="checkbox"
                    checked={autotestMode}
                    onChange={(e) => {
                      setAutotestMode(e.target.checked);
                      if (e.target.checked) setQrCodeUrl(null);
                    }}
                    className="rounded border-amber-300"
                  />
                  <span>
                    Auto Test (simulate QR scan & verify — no real charge)
                  </span>
                </label>
              )}
            </div>

            <p className="text-center text-sm text-gray-500 mt-4">
              Your payment is secured with 256-bit SSL encryption
            </p>
          </div>

          {/* Support Section */}
          <div className="bg-blue-50 border border-blue-100 rounded-2xl p-6">
            <h4 className="font-bold text-blue-900 mb-2">Need Help?</h4>
            <p className="text-sm text-blue-700 mb-4">
              If you encounter any issues with payment, please contact our
              support team.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => navigate("/help/payment")}
                className="px-4 py-2 bg-white text-blue-700 font-medium rounded-lg hover:bg-blue-50 transition-colors border border-blue-200"
              >
                Payment FAQ
              </button>
              <button
                onClick={() => navigate("/contact")}
                className="px-4 py-2 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition-colors"
              >
                Contact Support
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
