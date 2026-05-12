/**
 * Task 15: Deterministic payment method capability derivation (READ-ONLY).
 * No writes, queues, ledger mutation, reconciliation, projection changes, or provider auto-failover.
 */

/** @typedef {'enabled'|'disabled'|'maintenance'} CapabilityStatus — close-out: no other status values */

export const CAPABILITY_STATUS = Object.freeze({
  ENABLED: 'enabled',
  DISABLED: 'disabled',
  MAINTENANCE: 'maintenance',
});

export const REASON_CODES = Object.freeze({
  GATEWAY_REGISTRY_UNAVAILABLE: 'GATEWAY_REGISTRY_UNAVAILABLE',
  PROVIDER_NOT_REGISTERED: 'PROVIDER_NOT_REGISTERED',
  UNKNOWN_PROVIDER: 'UNKNOWN_PROVIDER',
  UNKNOWN_PAYMENT_METHOD: 'UNKNOWN_PAYMENT_METHOD',
  AMOUNT_BELOW_MIN: 'AMOUNT_BELOW_MIN',
  AMOUNT_ABOVE_MAX: 'AMOUNT_ABOVE_MAX',
  PROVIDER_MAINTENANCE: 'PROVIDER_MAINTENANCE',
  PAYMENT_GATEWAY_CIRCUIT_OPEN: 'PAYMENT_GATEWAY_CIRCUIT_OPEN',
  PAYSO_ENV_DISABLED: 'PAYSO_ENV_DISABLED',
  PAYSO_QR_DEPOSIT_BLOCKED: 'PAYSO_QR_DEPOSIT_BLOCKED',
  STRIPE_DISABLED: 'STRIPE_DISABLED',
  KSHER_CAPABILITY_DISABLED: 'KSHER_CAPABILITY_DISABLED',
  GATEWAY_REGISTRY_DISABLED: 'GATEWAY_REGISTRY_DISABLED',
  GATEWAY_NOT_LIVE: 'GATEWAY_NOT_LIVE',
  METHOD_NOT_SUPPORTED_FOR_PROVIDER: 'METHOD_NOT_SUPPORTED_FOR_PROVIDER',
});

export const KNOWN_BUILTIN_PROVIDERS = Object.freeze(['payso', 'ksher', 'stripe']);

const BUILTIN_MATRIX = [
  { provider: 'payso', method: 'promptpay' },
  { provider: 'payso', method: 'truemoney' },
  { provider: 'payso', method: 'shopeepay' },
  { provider: 'payso', method: 'wechat' },
  { provider: 'payso', method: 'alipay' },
  { provider: 'payso', method: 'card' },
  { provider: 'ksher', method: 'promptpay' },
  { provider: 'ksher', method: 'truemoney' },
  { provider: 'ksher', method: 'shopeepay' },
  { provider: 'ksher', method: 'wechat' },
  { provider: 'ksher', method: 'alipay' },
  { provider: 'ksher', method: 'card' },
  { provider: 'stripe', method: 'card' },
  { provider: 'stripe', method: 'promptpay' },
];

export function builtinMatrixPairs() {
  return [...BUILTIN_MATRIX];
}

function clampInt(v, lo, hi) {
  const n = Math.round(Number(v));
  if (!Number.isFinite(n)) return lo;
  return Math.min(hi, Math.max(lo, n));
}

/** Default bounds (minor units); PAYMENT_CAPABILITY_MIN_AMOUNT_MINOR / PAYMENT_CAPABILITY_MAX_AMOUNT_MINOR */
export function getDefaultAmountBoundsMinor() {
  const minRaw = process.env.PAYMENT_CAPABILITY_MIN_AMOUNT_MINOR;
  const maxRaw = process.env.PAYMENT_CAPABILITY_MAX_AMOUNT_MINOR;
  const min = minRaw != null && minRaw !== '' ? clampInt(minRaw, 0, Number.MAX_SAFE_INTEGER) : 1000;
  const max =
    maxRaw != null && maxRaw !== '' ? clampInt(maxRaw, min, Number.MAX_SAFE_INTEGER) : 5_000_000;
  return { min_amount_minor: min, max_amount_minor: Math.max(min, max) };
}

/**
 * Normalize identifiers — never remaps unknown providers or applies routing failover.
 * @returns {{ provider?: string, method?: string }}
 */
export function normalizeProviderMethodParams(providerRaw, methodRaw) {
  const provider = providerRaw != null ? String(providerRaw).toLowerCase().trim() : '';
  let method = methodRaw != null ? String(methodRaw).toLowerCase().trim().replace(/[\s-]+/g, '_') : '';
  if (method === 'prompt_pay') method = 'promptpay';
  if (method === 'true_money') method = 'truemoney';
  if (method === 'shopee_pay') method = 'shopeepay';
  return { provider: provider || undefined, method: method || undefined };
}

function registryMapFromRows(registryRows) {
  const m = new Map();
  for (const r of registryRows || []) {
    const id = String(r.gateway_id || '').toLowerCase();
    if (id) m.set(id, r);
  }
  return m;
}

export function supportsBuiltinMethod(provider, method) {
  return BUILTIN_MATRIX.some((x) => x.provider === provider && x.method === method);
}

/** @typedef {{ gateway_id:string, enabled?: boolean, lifecycle?: string, category?: string }} RegistryRowLite */

function baseCapsRow(provider, method, bounds, status, enabled, maintenance, reason_code) {
  return {
    provider,
    method,
    status,
    enabled: !!enabled,
    maintenance: !!maintenance,
    min_amount_minor: bounds.min_amount_minor,
    max_amount_minor: bounds.max_amount_minor,
    reason_code,
  };
}

function finalizeCapRow(base, gates, amountMinor) {
  return overlayAmountMinor(overlayOperationalGates(base, gates), amountMinor);
}

/** Apply PAYMENT_MAINTENANCE and payment_gateway circuit — runtime dominance (incl. over disabled/unknown base rows). */
export function overlayOperationalGates(cap, gates) {
  const bounds = getDefaultAmountBoundsMinor();
  const pr = cap.provider.toLowerCase();
  const maint = gates.maintenanceProviders instanceof Set ? gates.maintenanceProviders : new Set([]);
  if (maint.has(pr)) {
    return {
      ...cap,
      status: CAPABILITY_STATUS.MAINTENANCE,
      enabled: false,
      maintenance: true,
      min_amount_minor: cap.min_amount_minor ?? bounds.min_amount_minor,
      max_amount_minor: cap.max_amount_minor ?? bounds.max_amount_minor,
      reason_code: REASON_CODES.PROVIDER_MAINTENANCE,
    };
  }
  if (gates.paymentGatewayCircuitOpen === true) {
    return {
      ...cap,
      status: CAPABILITY_STATUS.MAINTENANCE,
      enabled: false,
      maintenance: true,
      min_amount_minor: cap.min_amount_minor ?? bounds.min_amount_minor,
      max_amount_minor: cap.max_amount_minor ?? bounds.max_amount_minor,
      reason_code: REASON_CODES.PAYMENT_GATEWAY_CIRCUIT_OPEN,
    };
  }
  return cap;
}

export function overlayAmountMinor(cap, amountMinor) {
  if (amountMinor == null) return cap;
  const n = Math.round(Number(amountMinor));
  if (!Number.isFinite(n)) return cap;
  const lo = Number(cap.min_amount_minor);
  const hi = Number(cap.max_amount_minor);
  if (!Number.isFinite(lo) || !Number.isFinite(hi)) return cap;
  if (n < lo) {
    return {
      ...cap,
      status: CAPABILITY_STATUS.DISABLED,
      enabled: false,
      maintenance: false,
      reason_code: REASON_CODES.AMOUNT_BELOW_MIN,
    };
  }
  if (n > hi) {
    return {
      ...cap,
      status: CAPABILITY_STATUS.DISABLED,
      enabled: false,
      maintenance: false,
      reason_code: REASON_CODES.AMOUNT_ABOVE_MAX,
    };
  }
  return cap;
}

function deriveBuiltinPair(c, regMap, tableMissing, ctx, bounds) {
  const p = c.provider.toLowerCase();
  const m = c.method.toLowerCase();

  if (!supportsBuiltinMethod(p, m)) {
    return baseCapsRow(p, m, bounds, CAPABILITY_STATUS.DISABLED, false, false, REASON_CODES.UNKNOWN_PAYMENT_METHOD);
  }

  if (!tableMissing) {
    const row = regMap.get(p);
    if (row) {
      const live = String(row.lifecycle || '').toLowerCase() === 'live';
      const en = !!row.enabled;
      if (!(en && live)) {
        const rc = en && !live ? REASON_CODES.GATEWAY_NOT_LIVE : REASON_CODES.GATEWAY_REGISTRY_DISABLED;
        return baseCapsRow(p, m, bounds, CAPABILITY_STATUS.DISABLED, false, false, rc);
      }
    }
  }

  if (p === 'stripe') {
    if (!ctx.stripeCardEnabled) {
      return baseCapsRow(p, m, bounds, CAPABILITY_STATUS.DISABLED, false, false, REASON_CODES.STRIPE_DISABLED);
    }
  }
  if (p === 'payso') {
    if (!ctx.paysoEnvEnabled) {
      return baseCapsRow(p, m, bounds, CAPABILITY_STATUS.DISABLED, false, false, REASON_CODES.PAYSO_ENV_DISABLED);
    }
    if (m === 'promptpay' && ctx.paysoQrDepositBlocked) {
      return baseCapsRow(p, m, bounds, CAPABILITY_STATUS.DISABLED, false, false, REASON_CODES.PAYSO_QR_DEPOSIT_BLOCKED);
    }
  }
  if (p === 'ksher') {
    if (!ctx.ksherCapabilityEnabled) {
      return baseCapsRow(p, m, bounds, CAPABILITY_STATUS.DISABLED, false, false, REASON_CODES.KSHER_CAPABILITY_DISABLED);
    }
  }

  const infoReg = tableMissing ? REASON_CODES.GATEWAY_REGISTRY_UNAVAILABLE : null;
  return baseCapsRow(p, m, bounds, CAPABILITY_STATUS.ENABLED, true, false, infoReg);
}

function deriveExtraRow(row, bounds, tableMissing, gates, amountMinor) {
  const provider = String(row.gateway_id || '').toLowerCase();
  if (!provider || KNOWN_BUILTIN_PROVIDERS.includes(provider)) return null;

  if (tableMissing) {
    const cap = overlayOperationalGates(
      baseCapsRow(
        provider,
        'psp_integration',
        bounds,
        CAPABILITY_STATUS.DISABLED,
        false,
        false,
        REASON_CODES.GATEWAY_REGISTRY_UNAVAILABLE,
      ),
      gates,
    );
    return overlayAmountMinor(cap, amountMinor);
  }

  const live = String(row.lifecycle || '').toLowerCase() === 'live';
  const en = !!row.enabled;
  let cap;
  if (!(en && live)) {
    const rc = !en ? REASON_CODES.GATEWAY_REGISTRY_DISABLED : REASON_CODES.GATEWAY_NOT_LIVE;
    cap = baseCapsRow(provider, 'psp_integration', bounds, CAPABILITY_STATUS.DISABLED, false, false, rc);
  } else {
    cap = baseCapsRow(provider, 'psp_integration', bounds, CAPABILITY_STATUS.ENABLED, true, false, null);
  }
  cap = overlayOperationalGates(cap, gates);
  return overlayAmountMinor(cap, amountMinor);
}

/**
 * @typedef {{
 *   provider?: string,
 *   method?: string,
 *   amount_minor?: number|null|string,
 *   currency?: string|null,
 * }} CapabilityQuery
 */

/**
 * @param {{
 *   query: CapabilityQuery,
 *   registry: { rows?: RegistryRowLite[], tableMissing?: boolean },
 *   context: {
 *     maintenanceProviders?: Iterable<string>,
 *     paymentGatewayCircuitOpen?: boolean,
 *     stripeCardEnabled?: boolean,
 *     paysoEnvEnabled?: boolean,
 *     paysoQrDepositBlocked?: boolean,
 *     ksherCapabilityEnabled?: boolean,
 *   },
 * }} input
 */
export function derivePaymentMethodCapabilities(input) {
  const q = input.query || {};
  const nf = normalizeProviderMethodParams(q.provider, q.method);
  const amountMinorRaw = q.amount_minor;
  const amountMinor =
    amountMinorRaw == null || amountMinorRaw === ''
      ? null
      : Math.round(Number(amountMinorRaw));

  const tableMissing = input.registry?.tableMissing === true;
  const rows = [...(input.registry?.rows || [])];
  const regMap = registryMapFromRows(rows);
  const bounds = getDefaultAmountBoundsMinor();
  const ctxIn = input.context || {};
  const maintenanceList = ctxIn.maintenanceProviders
    ? [...ctxIn.maintenanceProviders].map((s) => String(s).toLowerCase())
    : [];
  const gates = {
    maintenanceProviders: new Set(maintenanceList),
    paymentGatewayCircuitOpen: ctxIn.paymentGatewayCircuitOpen === true,
  };

  const ctx = {
    stripeCardEnabled: ctxIn.stripeCardEnabled !== false,
    paysoEnvEnabled: ctxIn.paysoEnvEnabled !== false,
    paysoQrDepositBlocked: ctxIn.paysoQrDepositBlocked === true,
    ksherCapabilityEnabled:
      ctxIn.ksherCapabilityEnabled !== undefined
        ? !!ctxIn.ksherCapabilityEnabled
        : !(String(process.env.PAYMENT_KSHER_CAPABILITY_ENABLED || '')
            .toLowerCase()
            .match(/^(0|false|off)$/)),
  };

  const out = [];

  /** --- Both provider + method --- */
  if (nf.provider && nf.method) {
    const p = nf.provider.toLowerCase();
    const m = nf.method.toLowerCase();

    if (!KNOWN_BUILTIN_PROVIDERS.includes(p)) {
      if (tableMissing) {
        out.push(
          finalizeCapRow(
            baseCapsRow(p, m, bounds, CAPABILITY_STATUS.DISABLED, false, false, REASON_CODES.GATEWAY_REGISTRY_UNAVAILABLE),
            gates,
            amountMinor,
          ),
        );
      } else {
        const row = regMap.get(p);
        if (!row) {
          out.push(
            finalizeCapRow(
              baseCapsRow(p, m, bounds, CAPABILITY_STATUS.DISABLED, false, false, REASON_CODES.UNKNOWN_PROVIDER),
              gates,
              amountMinor,
            ),
          );
        } else if (m !== 'psp_integration') {
          out.push(
            finalizeCapRow(
              baseCapsRow(p, m, bounds, CAPABILITY_STATUS.DISABLED, false, false, REASON_CODES.METHOD_NOT_SUPPORTED_FOR_PROVIDER),
              gates,
              amountMinor,
            ),
          );
        } else {
          const ex = deriveExtraRow(row, bounds, tableMissing, gates, amountMinor);
          if (ex) out.push(ex);
        }
      }
    } else if (!supportsBuiltinMethod(p, m)) {
      out.push(
        finalizeCapRow(
          baseCapsRow(p, m, bounds, CAPABILITY_STATUS.DISABLED, false, false, REASON_CODES.UNKNOWN_PAYMENT_METHOD),
          gates,
          amountMinor,
        ),
      );
    } else {
      let cap = deriveBuiltinPair({ provider: p, method: m }, regMap, tableMissing, ctx, bounds);
      cap = overlayOperationalGates(cap, gates);
      out.push(overlayAmountMinor(cap, amountMinor));
    }
  } else if (nf.provider && !nf.method) {
    const p = nf.provider.toLowerCase();
    if (!KNOWN_BUILTIN_PROVIDERS.includes(p)) {
      if (tableMissing) {
        out.push(
          finalizeCapRow(
            baseCapsRow(p, 'psp_integration', bounds, CAPABILITY_STATUS.DISABLED, false, false, REASON_CODES.GATEWAY_REGISTRY_UNAVAILABLE),
            gates,
            amountMinor,
          ),
        );
      } else {
        const row = regMap.get(p);
        if (!row) {
          out.push(
            finalizeCapRow(
              baseCapsRow(p, 'psp_integration', bounds, CAPABILITY_STATUS.DISABLED, false, false, REASON_CODES.UNKNOWN_PROVIDER),
              gates,
              amountMinor,
            ),
          );
        } else {
          const ex = deriveExtraRow(row, bounds, tableMissing, gates, amountMinor);
          if (ex) out.push(ex);
        }
      }
    } else {
      for (const c of BUILTIN_MATRIX.filter((x) => x.provider === p)) {
        let cap = deriveBuiltinPair(c, regMap, tableMissing, ctx, bounds);
        cap = overlayOperationalGates(cap, gates);
        out.push(overlayAmountMinor(cap, amountMinor));
      }
    }
  } else if (!nf.provider && nf.method) {
    const m = nf.method.toLowerCase();
    for (const c of BUILTIN_MATRIX.filter((x) => x.method === m)) {
      let cap = deriveBuiltinPair(c, regMap, tableMissing, ctx, bounds);
      cap = overlayOperationalGates(cap, gates);
      out.push(overlayAmountMinor(cap, amountMinor));
    }
    if (m === 'psp_integration' && !tableMissing) {
      const seen = new Set(out.map((x) => x.provider));
      for (const row of rows) {
        const gid = String(row.gateway_id || '').toLowerCase();
        if (!gid || KNOWN_BUILTIN_PROVIDERS.includes(gid) || seen.has(gid)) continue;
        seen.add(gid);
        const ex = deriveExtraRow(row, bounds, tableMissing, gates, amountMinor);
        if (ex) out.push(ex);
      }
    }
  } else {
    for (const c of BUILTIN_MATRIX) {
      let cap = deriveBuiltinPair(c, regMap, tableMissing, ctx, bounds);
      cap = overlayOperationalGates(cap, gates);
      out.push(overlayAmountMinor(cap, amountMinor));
    }
    if (!tableMissing) {
      const seenBuiltin = new Set(BUILTIN_MATRIX.map((x) => x.provider));
      for (const row of rows) {
        const gid = String(row.gateway_id || '').toLowerCase();
        if (!gid || seenBuiltin.has(gid)) continue;
        const ex = deriveExtraRow(row, bounds, tableMissing, gates, amountMinor);
        if (ex) out.push(ex);
      }
    }
  }

  out.sort((a, b) => {
    const dp = String(a.provider).localeCompare(String(b.provider));
    if (dp !== 0) return dp;
    return String(a.method).localeCompare(String(b.method));
  });
  return out;
}
