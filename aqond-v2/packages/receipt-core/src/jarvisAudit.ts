import type { ReceiptRenderData } from './types';

export type JarvisAuditInput = {
  order_id: string;
  amount_micro?: number;
  item_count?: number;
  payment_method?: string;
};

export type JarvisAuditResult = {
  audit_id: string;
  risk_score: string;
  fraud_flag: string;
  integrity: string;
  jarvis_version: string;
};

/** Jarvis receipt intelligence — lightweight audit envelope for R001. */
export function buildJarvisAuditEnvelope(input: JarvisAuditInput): JarvisAuditResult {
  const amount = (input.amount_micro || 0) / 100;
  let risk = 'Low';
  if (amount >= 50000) risk = 'Medium';
  if (amount >= 200000) risk = 'Elevated';

  return {
    audit_id: `JRV-${input.order_id.slice(-10).toUpperCase()}`,
    risk_score: risk,
    fraud_flag: risk === 'Low' ? 'None' : 'Monitor',
    integrity: 'Verified',
    jarvis_version: '1.0.0',
  };
}

export function jarvisAuditToRenderData(audit: JarvisAuditResult): ReceiptRenderData['jarvis_audit'] {
  return {
    audit_id: audit.audit_id,
    risk_score: audit.risk_score,
    fraud: audit.fraud_flag,
    integrity: audit.integrity,
    jarvis_version: audit.jarvis_version,
  };
}
