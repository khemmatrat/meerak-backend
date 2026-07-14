/** Quick L2 hint for SDK fail-closed when AGK unreachable (mirrors risk-engine.js). */

const FINANCIAL_HINTS = /\b(pay|wallet|checkout|transfer|refund|charge|บัตร|ชำระ|โอน|คืนเงิน)\b/i;
const PII_HINTS = /\b(ssn|passport|บัตรประชาชน|passwords?|api\s*keys?)\b/i;
const ADMIN_HINTS = /\b(admin|rbac|permission|sudo)\b/i;

export function quickRiskClass(userMessage = '', action = 'none') {
  const msg = String(userMessage);
  if (FINANCIAL_HINTS.test(msg) || action === 'checkout' || action === 'pay') return 'L2';
  if (PII_HINTS.test(msg) || ADMIN_HINTS.test(msg)) return 'L2';
  if (msg.length > 1500) return 'L1';
  return 'L0';
}

export function isL2Plus(riskClass) {
  return riskClass === 'L2';
}
