/**
 * Deposit channel tiles — Pure UI + callbacks only.
 */
import React from "react";
import {
  FileUp,
  QrCode,
  CreditCard,
  Wallet as WalletIcon,
  Landmark,
  ChevronRight,
} from "lucide-react";

export type WalletDepositM1MethodChoice =
  | "manual_slip"
  | "payso_promptpay"
  | "gateway_card"
  | "gateway_truemoney"
  | "gateway_mobile_banking";

type Tone = {
  ring: string;
  bg: string;
  hover: string;
  iconWrap: string;
  iconColor: string;
  titleColor: string;
};

const PALETTE: Record<WalletDepositM1MethodChoice, Tone> = {
  manual_slip: {
    ring: "ring-amber-400/25",
    bg: "from-amber-50 via-white to-white",
    hover: "hover:border-amber-400/90 hover:bg-amber-50/80",
    iconWrap: "bg-amber-100 text-amber-800 ring-1 ring-amber-200/70",
    iconColor: "",
    titleColor: "text-amber-950",
  },
  payso_promptpay: {
    ring: "ring-emerald-400/25",
    bg: "from-emerald-50 via-white to-white",
    hover: "hover:border-emerald-500/90 hover:bg-emerald-50/80",
    iconWrap: "bg-emerald-100 text-emerald-800 ring-1 ring-emerald-200/70",
    iconColor: "",
    titleColor: "text-emerald-950",
  },
  gateway_card: {
    ring: "ring-blue-400/25",
    bg: "from-blue-50 via-white to-white",
    hover: "hover:border-blue-500/90 hover:bg-blue-50/80",
    iconWrap: "bg-blue-100 text-blue-800 ring-1 ring-blue-200/70",
    iconColor: "",
    titleColor: "text-blue-950",
  },
  gateway_truemoney: {
    ring: "ring-orange-400/25",
    bg: "from-orange-50 via-white to-white",
    hover: "hover:border-orange-500/90 hover:bg-orange-50/80",
    iconWrap: "bg-orange-100 text-orange-800 ring-1 ring-orange-200/70",
    iconColor: "",
    titleColor: "text-orange-950",
  },
  gateway_mobile_banking: {
    ring: "ring-violet-400/25",
    bg: "from-violet-50 via-white to-white",
    hover: "hover:border-violet-500/90 hover:bg-violet-50/80",
    iconWrap: "bg-violet-100 text-violet-800 ring-1 ring-violet-200/70",
    iconColor: "",
    titleColor: "text-violet-950",
  },
};

function MethodTile({
  tone,
  icon,
  title,
  description,
  onClick,
}: {
  tone: Tone;
  icon: React.ReactNode;
  title: string;
  description: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`group relative mb-3 flex w-full items-center gap-3 overflow-hidden rounded-2xl border border-slate-200/90 bg-gradient-to-br ${tone.bg} p-3.5 text-left shadow-sm shadow-slate-900/5 ring-1 ${tone.ring} transition-all duration-200 ${tone.hover} active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/40 focus-visible:ring-offset-2 focus-visible:ring-offset-white`}
    >
      <span
        className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${tone.iconWrap}`}
      >
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span
          className={`block text-sm font-bold tracking-tight ${tone.titleColor}`}
        >
          {title}
        </span>
        <span className="mt-0.5 block text-xs leading-snug text-slate-600">
          {description}
        </span>
      </span>
      <ChevronRight
        className="h-5 w-5 shrink-0 text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-slate-500"
        aria-hidden
      />
    </button>
  );
}

export function WalletDepositMethodPicker({
  onSelectMethod,
  onCancel,
}: {
  onSelectMethod: (method: WalletDepositM1MethodChoice) => void;
  onCancel: () => void;
}) {
  return (
    <div className="space-y-1">
      <div className="mb-5">
        <h3 className="text-xl font-bold tracking-tight text-slate-900">
          เติมเงิน
        </h3>
        <p className="mt-1.5 text-xs leading-relaxed text-slate-600">
          เลือกช่องทาง — สรุปค่าธรรมเนียมดูในขั้นถัดไปจากปุ่ม
          &quot;รีเฟรชสรุป&quot; หรือเมื่อระบบโหลดสรุปให้อัตโนมัติ
        </p>
      </div>

      <MethodTile
        tone={PALETTE.manual_slip}
        icon={<FileUp className="h-5 w-5" strokeWidth={2} />}
        title="แนบสลิป (Manual)"
        description="โอนแล้วอัปโหลดสลิป — ยอดเข้าหลังทีมตรวจ"
        onClick={() => onSelectMethod("manual_slip")}
      />
      <MethodTile
        tone={PALETTE.payso_promptpay}
        icon={<QrCode className="h-5 w-5" strokeWidth={2} />}
        title="PromptPay QR (PaySo)"
        description="สร้าง QR จาก PaySo — สแกนจ่ายผ่านแอปธนาคาร"
        onClick={() => onSelectMethod("payso_promptpay")}
      />
      <MethodTile
        tone={PALETTE.gateway_card}
        icon={<CreditCard className="h-5 w-5" strokeWidth={2} />}
        title="Credit / Debit Card"
        description="ชำระผ่านหน้า Pay Solutions — กรอกบัตรอย่างปลอดภัย เครดิตอัตโนมัติหลังชำระสำเร็จ"
        onClick={() => onSelectMethod("gateway_card")}
      />
      <MethodTile
        tone={PALETTE.gateway_truemoney}
        icon={<WalletIcon className="h-5 w-5" strokeWidth={2} />}
        title="TrueMoney Wallet"
        description="ชำระผ่านหน้า Pay Solutions — เลือก TrueMoney เครดิตอัตโนมัติหลังชำระสำเร็จ"
        onClick={() => onSelectMethod("gateway_truemoney")}
      />
      <MethodTile
        tone={PALETTE.gateway_mobile_banking}
        icon={<Landmark className="h-5 w-5" strokeWidth={2} />}
        title="Mobile Banking"
        description="ชำระผ่านหน้า Pay Solutions — เลือกธนาคาร เครดิตอัตโนมัติหลังชำระสำเร็จ"
        onClick={() => onSelectMethod("gateway_mobile_banking")}
      />

      <button
        type="button"
        onClick={onCancel}
        className="mt-1 w-full rounded-2xl border-2 border-slate-200 bg-white py-3.5 text-sm font-semibold text-slate-700 shadow-sm transition-colors duration-150 hover:border-slate-300 hover:bg-slate-50 active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400/50 focus-visible:ring-offset-2 focus-visible:ring-offset-white"
      >
        ยกเลิก
      </button>
    </div>
  );
}
