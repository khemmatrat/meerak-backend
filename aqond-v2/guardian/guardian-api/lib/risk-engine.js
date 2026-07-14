/** Phase 1.2 — lightweight risk scoring (shadow; advisory only). */

const FINANCIAL_HINTS = /\b(pay|wallet|checkout|transfer|refund|charge|บัตร|ชำระ|โอน|คืนเงิน)\b/i;
const PII_HINTS = /\b(ssn|passport|บัตรประชาชน|เบอร์โทร|email|address|ที่อยู่)\b/i;
const ADMIN_HINTS = /\b(admin|rbac|permission|role|sudo|root)\b/i;

export function scoreRisk(input = {}) {
  const message = String(input.user_message || '').slice(0, 4000);
  const action = String(input.action || input.action_class || 'none');
  const surface = String(input.surface || 'jarvis');

  let score = 0.05;
  const factors = [];

  if (FINANCIAL_HINTS.test(message) || action === 'checkout' || action === 'pay') {
    score += 0.45;
    factors.push('financial_context');
    if (action === 'pay' || action === 'checkout') {
      score += 0.3;
      factors.push('payment_action');
    }
  }
  if (PII_HINTS.test(message)) {
    score += 0.35;
    factors.push('pii_context');
  }
  if (ADMIN_HINTS.test(message)) {
    score += 0.4;
    factors.push('admin_context');
  }
  if (message.length > 1500) {
    score += 0.1;
    factors.push('long_message');
  }
  if (surface === 'hermes') {
    score += 0.1;
    factors.push('automation_surface');
  }

  score = Math.min(1, Math.round(score * 100) / 100);

  let riskClass = 'L0';
  if (score >= 0.7) riskClass = 'L2';
  else if (score >= 0.35) riskClass = 'L1';

  return {
    risk_score: score,
    risk_class: riskClass,
    factors,
    would_deny: false,
    timeout: false,
  };
}
