export type PaymentMethodId =
  | 'cod'
  | 'card'
  | 'promptpay'
  | 'bank_transfer'
  | 'truemoney';

export type PaymentMethodOption = {
  id: PaymentMethodId;
  icon: string;
  title: string;
  sub: string;
  badge?: string;
};

export const PAYMENT_METHODS: PaymentMethodOption[] = [
  {
    id: 'cod',
    icon: '💵',
    title: 'เงินสด (เก็บปลายทาง)',
    sub: 'ชำระเมื่อได้รับอาหาร/สินค้า',
  },
  {
    id: 'card',
    icon: '💳',
    title: 'บัตรเครดิต / เดบิต',
    sub: 'Visa · Mastercard · JCB (3DS)',
  },
  {
    id: 'promptpay',
    icon: '📱',
    title: 'QR Code / PromptPay',
    sub: 'สแกนจ่ายผ่านแอปธนาคาร',
    badge: 'ยอดนิยม',
  },
  {
    id: 'bank_transfer',
    icon: '🏦',
    title: 'โอนผ่านธนาคาร',
    sub: 'KBANK · SCB · BBL · KTB · อื่นๆ',
  },
  {
    id: 'truemoney',
    icon: '💙',
    title: 'TrueMoney Wallet',
    sub: 'จ่ายผ่าน TrueMoney · รับส่วนลดพิเศษ',
    badge: 'โปร',
  },
];

export function paymentMethodLabel(id: string): string {
  return PAYMENT_METHODS.find((m) => m.id === id)?.title || id;
}

export function paymentRequiresOnline(id: PaymentMethodId) {
  return id !== 'cod';
}
