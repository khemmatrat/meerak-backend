import React from "react";
import { Smartphone, QrCode } from "lucide-react";

export type PaymentChannelId = "promptpay" | "truemoney" | "shopeepay" | "stripe";

type Props = {
  selected?: PaymentChannelId | null;
  onSelect: (id: PaymentChannelId) => void;
  stripeEnabled?: boolean;
};

/** โลโก้สไตล์แบรนด์ (สีใกล้เคียง) — ไม่ใช้เครื่องหมายการค้าจริงจากไฟล์ภายนอก */
function LogoPromptPay() {
  return (
    <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-emerald-600 to-teal-700 flex items-center justify-center shadow-md">
      <QrCode className="w-7 h-7 text-white" strokeWidth={2.2} />
    </div>
  );
}

function LogoTrueMoney() {
  return (
    <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-sky-500 to-blue-700 flex items-center justify-center shadow-md text-white font-black text-2xl leading-none">
      T
    </div>
  );
}

function LogoShopeePay() {
  return (
    <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-orange-500 to-orange-700 flex items-center justify-center shadow-md text-white font-black text-2xl leading-none">
      S
    </div>
  );
}

function LogoStripe() {
  return (
    <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-indigo-600 to-violet-700 flex items-center justify-center shadow-md">
      <Smartphone className="w-7 h-7 text-white" strokeWidth={2} />
    </div>
  );
}

const CHANNELS: Array<{
  id: PaymentChannelId;
  title: string;
  subtitle: string;
  Logo: React.FC;
}> = [
  { id: "promptpay", title: "PromptPay", subtitle: "QR พร้อมเพย์", Logo: LogoPromptPay },
  { id: "truemoney", title: "TrueMoney", subtitle: "วอลเล็ต / สแกน", Logo: LogoTrueMoney },
  { id: "shopeepay", title: "ShopeePay", subtitle: "Shopee Pay", Logo: LogoShopeePay },
  { id: "stripe", title: "บัตรเครดิต/เดบิต", subtitle: "Stripe (สำรอง)", Logo: LogoStripe },
];

export const PaymentMethodChannelGrid: React.FC<Props> = ({
  selected,
  onSelect,
  stripeEnabled = true,
}) => {
  const list = stripeEnabled ? CHANNELS : CHANNELS.filter((c) => c.id !== "stripe");
  return (
    <div className="grid grid-cols-2 sm:grid-cols-2 gap-4">
      {list.map(({ id, title, subtitle, Logo }) => {
        const active = selected === id;
        return (
          <button
            key={id}
            type="button"
            onClick={() => onSelect(id)}
            className={`text-left rounded-2xl border-2 p-4 transition-all flex flex-col gap-3 ${
              active
                ? "border-emerald-500 bg-emerald-50/90 shadow-lg ring-2 ring-emerald-500/20"
                : "border-slate-200 bg-white hover:border-emerald-300 hover:shadow-md"
            }`}
          >
            <Logo />
            <div>
              <p className="font-bold text-slate-900 text-sm">{title}</p>
              <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>
            </div>
          </button>
        );
      })}
    </div>
  );
};
