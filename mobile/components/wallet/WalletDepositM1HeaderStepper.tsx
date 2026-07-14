/**
 * Presentational stepper for wallet deposit (M1) — consumes existing step enum only.
 */
import React from "react";
import { CheckCircle } from "lucide-react";
import type { WalletDepositM1Step } from "../../types/walletDepositContract";

/** M1 — for stepper chip text derived from parent's method state only. */
export type WalletM1MethodForStepper =
  | "manual_slip"
  | "payso_promptpay"
  | "gateway_card"
  | "gateway_truemoney"
  | "gateway_mobile_banking"
  | null;

function walletM1MethodShortLabel(
  method: WalletM1MethodForStepper,
): string | null {
  switch (method) {
    case "manual_slip":
      return "แนบสลิป";
    case "payso_promptpay":
      return "PromptPay";
    case "gateway_card":
      return "บัตรเครดิต";
    case "gateway_truemoney":
      return "TrueMoney";
    case "gateway_mobile_banking":
      return "Mobile Banking";
    default:
      return null;
  }
}

function walletDepositM1StepperStep3Titles(step: WalletDepositM1Step): {
  headline: string;
  sub?: string;
} {
  switch (step) {
    case "payso_qr":
      return {
        headline: "กำลังชำระเงิน",
        sub: "สแกน QR และรอผลยืนยัน",
      };
    case "manual_slip":
      return {
        headline: "แนบหลักฐาน",
        sub: "อัปโหลดสลิปหลังโอน",
      };
    case "manual_done":
      return {
        headline: "เสร็จสิ้น",
        sub: "รับเรื่องตรวจสอบแล้ว",
      };
    default:
      return { headline: "ชำระหรือจบ" };
  }
}

export function WalletDepositM1HeaderStepper({
  walletDepositM1Step,
  walletM1Method,
}: {
  walletDepositM1Step: WalletDepositM1Step;
  walletM1Method: WalletM1MethodForStepper;
}) {
  const methodChip = walletM1MethodShortLabel(walletM1Method);
  const firstState: "done" | "current" | "upcoming" =
    walletDepositM1Step === "choose_method" ? "current" : "done";
  const secondState: "done" | "current" | "upcoming" =
    walletDepositM1Step === "choose_method"
      ? "upcoming"
      : walletDepositM1Step === "enter_amount"
        ? "current"
        : "done";
  const thirdBase: "done" | "current" | "upcoming" =
    walletDepositM1Step === "choose_method" ||
    walletDepositM1Step === "enter_amount"
      ? "upcoming"
      : walletDepositM1Step === "manual_done"
        ? "done"
        : "current";
  const thirdState = thirdBase;

  const connector12 = walletDepositM1Step !== "choose_method";
  const connector23 =
    walletDepositM1Step !== "choose_method" &&
    walletDepositM1Step !== "enter_amount";

  const thirdTitles = walletDepositM1StepperStep3Titles(walletDepositM1Step);
  const thirdLabel =
    thirdState === "upcoming"
      ? { headline: "ชำระหรือจบ", sub: undefined as string | undefined }
      : thirdTitles;

  const steps: Array<{
    state: "done" | "current" | "upcoming";
    title: string;
    sub?: string;
  }> = [
    { state: firstState, title: "เลือกช่องทาง" },
    { state: secondState, title: "ยอดและค่าธรรมเนียม" },
    {
      state: thirdState,
      title: thirdLabel.headline,
      sub: thirdLabel.sub,
    },
  ];

  return (
    <div className="mb-5 rounded-2xl border border-emerald-100/90 bg-gradient-to-br from-white via-emerald-50/35 to-teal-50/30 p-4 shadow-sm shadow-emerald-900/5 ring-1 ring-white/80">
      {methodChip !== null && secondState !== "upcoming" && (
        <p className="mb-3 text-center text-[10px] font-medium uppercase tracking-wide text-emerald-600/90">
          ช่องทาง:{" "}
          <span className="normal-case tracking-normal font-semibold text-slate-700">
            {methodChip}
          </span>
        </p>
      )}
      <div className="flex items-center px-1">
        {steps.map((s, i) => (
          <React.Fragment key={`deposit-m1-step-dot-${i}`}>
            {i > 0 && (
              <div
                className={`mx-1 h-[3px] min-w-[8px] flex-1 rounded-full ${
                  i === 1
                    ? connector12
                      ? "bg-gradient-to-r from-emerald-500 to-teal-500"
                      : "bg-slate-200"
                    : connector23
                      ? "bg-gradient-to-r from-emerald-500 to-teal-500"
                      : "bg-slate-200"
                }`}
                aria-hidden
              />
            )}
            <div className="flex flex-col items-center">
              <div
                className={
                  s.state === "done"
                    ? "flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-white shadow-sm ring-[3px] ring-emerald-500/25"
                    : s.state === "current"
                      ? "flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 border-emerald-600 bg-white text-[11px] font-bold text-emerald-900 shadow-md shadow-emerald-900/15 ring-[3px] ring-emerald-400/35"
                      : "flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-white text-[11px] font-semibold text-slate-400"
                }
              >
                {s.state === "done" ? (
                  <CheckCircle className="h-4 w-4 shrink-0" strokeWidth={2.5} />
                ) : (
                  i + 1
                )}
              </div>
            </div>
          </React.Fragment>
        ))}
      </div>
      <div className="mt-3 flex gap-1">
        {steps.map((s, i) => (
          <div
            key={`deposit-m1-step-label-${i}`}
            className="min-w-0 flex-1 px-0.5 text-center"
          >
            <span
              className={`block text-[10px] font-semibold leading-tight tracking-tight ${
                s.state === "done"
                  ? "text-emerald-800"
                  : s.state === "current"
                    ? "text-emerald-900"
                    : "text-slate-400"
              }`}
            >
              {s.title}
            </span>
            {s.sub &&
            (s.state === "current" ||
              (i === 2 && walletDepositM1Step === "manual_done")) ? (
              <span className="mt-0.5 block text-[10px] font-normal leading-snug text-slate-600">
                {s.sub}
              </span>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}
