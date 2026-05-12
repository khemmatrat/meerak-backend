/**
 * Public snapshot สำหรับมือถือ — ช่องทางชำระเงิน/เติมเงินที่เปิด + ข้อความ UI
 * อ่านจาก ENV, paymentProviderGate, circuit breaker payment_gateway
 */
import { getPaymentProviderGateSnapshot } from './paymentProviderGate.js';

/**
 * @param {(service: string) => Promise<string|null>} getCircuitStatus
 */
export async function buildPaymentChannelsAvailability(getCircuitStatus) {
  const gate = getPaymentProviderGateSnapshot();
  const paysoQrEnabled = !!gate.paysoQrWalletTopupEnabled;
  const cbPayment = await getCircuitStatus('payment_gateway');
  const circuitOpen = cbPayment === 'open';
  const stripeEnabled = gate.stripeCardEnabled;

  const messagesTh = {
    payso_qr: paysoQrEnabled
      ? null
      : 'ช่องทางเติมเงิน QR (PaySo) ปิดชั่วคราว — ใช้โอนธนาคารพร้อมแนบสลิปได้',
    payment_gateway: circuitOpen
      ? 'ระบบชำระเงินชั่วคราวไม่พร้อม — ลองใหม่ภายหลัง หรือใช้วอลเล็ตหากมียอด'
      : null,
  };
  const messagesEn = {
    payso_qr: paysoQrEnabled
      ? null
      : 'PaySo QR top-up is temporarily disabled — use bank transfer with slip.',
    payment_gateway: circuitOpen
      ? 'Checkout is temporarily unavailable. Try again later or pay from wallet balance.'
      : null,
  };

  return {
    updated_at: new Date().toISOString(),
    local_gateway: gate.localGateway,
    local_gateway_label: gate.localGatewayLabel,
    stripe_card_enabled: stripeEnabled,
    wallet: {
      payso_qr_enabled: paysoQrEnabled,
      manual_slip_enabled: true,
    },
    job_checkout: {
      payment_gateway_available: !circuitOpen,
      promptpay_local_enabled: !circuitOpen,
      stripe_card_enabled: stripeEnabled && !circuitOpen,
    },
    messages: { th: messagesTh, en: messagesEn },
  };
}
