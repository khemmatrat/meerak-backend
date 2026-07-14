/** Phase 1.2 — rule-based prompt injection scan (shadow only; never blocks in 1.2). */

const INJECTION_PATTERNS = [
  { code: 'firewall.ignore_instructions', re: /ignore\s+(all\s+)?(previous|prior|above)\s+instructions/i, severity: 'high' },
  { code: 'firewall.system_prompt_leak', re: /(reveal|show|print|dump)\s+(your\s+)?(system\s+prompt|hidden\s+instructions)/i, severity: 'high' },
  { code: 'firewall.role_override', re: /you\s+are\s+now\s+(a|an)\s+/i, severity: 'medium' },
  { code: 'firewall.jailbreak_dan', re: /\bDAN\b|do\s+anything\s+now/i, severity: 'high' },
  { code: 'firewall.exfil_pii', re: /(list|dump|export)\s+(all\s+)?(users?|customers?|passwords?|api\s*keys?)/i, severity: 'critical' },
  { code: 'firewall.tool_abuse', re: /(run|execute|call)\s+(sql|shell|bash|curl|wget)\b/i, severity: 'high' },
  { code: 'firewall.delimiter_injection', re: /<\s*\/?\s*(system|assistant|user)\s*>/i, severity: 'medium' },
];

export function scanPromptFirewall(userMessage = '') {
  const text = String(userMessage || '').slice(0, 4000);
  const alerts = [];

  for (const { code, re, severity } of INJECTION_PATTERNS) {
    if (re.test(text)) {
      alerts.push({ code, severity, matched: true });
    }
  }

  const wouldBlock = alerts.some((a) => a.severity === 'high' || a.severity === 'critical');
  return {
    scanned: true,
    alert_count: alerts.length,
    alerts,
    would_block: wouldBlock,
  };
}
