import { scanPromptFirewall } from './prompt-firewall.js';
import { scoreRisk } from './risk-engine.js';

/**
 * Phase 1.2 shadow evaluation — always returns decision: allow.
 * Logs would_block / would_deny for policy tuning in Phase 1.3.
 */
export function evaluateShadow(input = {}) {
  const firewall = scanPromptFirewall(input.user_message);
  const risk = scoreRisk(input);

  const wouldDeny = risk.risk_class === 'L2' && (firewall.would_block || risk.risk_score >= 0.85);
  const alerts = [...firewall.alerts];

  if (risk.risk_class === 'L2' && !firewall.would_block) {
    alerts.push({ code: 'risk.elevated_l2', severity: 'medium', risk_class: risk.risk_class });
  }
  if (risk.risk_class === 'L1') {
    alerts.push({ code: 'risk.elevated_l1', severity: 'low', risk_class: risk.risk_class });
  }

  return {
    mode: 'shadow',
    decision: 'allow',
    shadow: {
      would_block: firewall.would_block,
      would_deny: wouldDeny,
      firewall,
      risk,
      alerts,
      alert_count: alerts.length,
    },
  };
}
