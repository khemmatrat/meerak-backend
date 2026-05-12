/**
 * Task 15 close-out: payment method capability READ-model verification.
 *
 *   cd backend && node scripts/test_payment_method_capabilities.js
 */
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

import dotenv from 'dotenv';

import {
  derivePaymentMethodCapabilities,
  builtinMatrixPairs,
  CAPABILITY_STATUS,
  REASON_CODES,
  overlayOperationalGates,
  getDefaultAmountBoundsMinor,
} from '../lib/paymentMethodCapabilities.js';
import { getPaymentCapabilityContext } from '../lib/paymentProviderGate.js';

const ALLOWED_CAP_STATUSES = new Set(['enabled', 'disabled', 'maintenance']);

const __dirname = dirname(fileURLToPath(import.meta.url));
const backendDir = join(__dirname, '..');
const CAP_MODULE_PATH = join(backendDir, 'lib', 'paymentMethodCapabilities.js');
const GATE_MODULE_PATH = join(backendDir, 'lib', 'paymentProviderGate.js');

dotenv.config({ path: join(backendDir, '.env') });
dotenv.config({ path: join(backendDir, '..', '.env') });

let pass = 0;
let fail = 0;

function ok(n) {
  pass += 1;
  console.log(`  ✓ ${n}`);
}
function notOk(n, d) {
  fail += 1;
  console.error(`  ✗ ${n} :: ${d}`);
}
function assert(cond, label, detail = '') {
  if (cond) ok(label);
  else notOk(label, detail);
}

const baseCtx = {
  maintenanceProviders: [],
  paymentGatewayCircuitOpen: false,
  stripeCardEnabled: true,
  paysoEnvEnabled: true,
  paysoQrDepositBlocked: false,
  ksherCapabilityEnabled: true,
};

const livePayso = { gateway_id: 'payso', enabled: true, lifecycle: 'live' };
const liveKsher = { gateway_id: 'ksher', enabled: true, lifecycle: 'live' };
const liveStripe = { gateway_id: 'stripe', enabled: true, lifecycle: 'live' };

function findCap(caps, provider, method) {
  return caps.find((c) => c.provider === provider && c.method === method);
}

function assertOnlyCanonicalStatuses(caps, label) {
  const bad = caps.find((c) => !ALLOWED_CAP_STATUSES.has(c.status));
  assert(!bad, label, bad ? JSON.stringify(bad) : '');
}

/** J: capability module — no persistence / queues / webhook coupling. */
function assertCapabilityModuleReadOnly() {
  const src = readFileSync(CAP_MODULE_PATH, 'utf8');
  assert(!/\bcreated_at\b/i.test(src), 'J. paymentMethodCapabilities: no created_at dependency');
  const badWrite = /\b(pool\.query|INSERT\s+INTO|UPDATE\s+[\w.]+\s+SET\b|DELETE\s+FROM\b|enqueue|Bull)\b/i.exec(src);
  assert(!badWrite, 'J. paymentMethodCapabilities: read-only derivation (no DML/enqueue)', badWrite && badWrite[0]);
}

/** J: snapshot builder must read only ENV + runtime JSON slice (no writes in this export). */
function assertGetPaymentCapabilityContextReadOnly() {
  const src = readFileSync(GATE_MODULE_PATH, 'utf8');
  const idx = src.indexOf('export function getPaymentCapabilityContext()');
  assert(idx >= 0, 'J. find getPaymentCapabilityContext in paymentProviderGate');
  const brace = src.indexOf('{', idx);
  let depth = 0;
  let end = brace;
  for (let i = brace; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') {
      depth--;
      if (depth === 0) {
        end = i;
        break;
      }
    }
  }
  const body = src.slice(brace + 1, end);
  const bad = /\b(writeFileSync|unlinkSync|persistRuntimeToDisk|pool\.query|INSERT\s|UPDATE\s+[\w.]+\s+SET|DELETE\s+FROM|enqueue|Bull)\b/i.exec(body);
  assert(!bad, 'J. getPaymentCapabilityContext body is read-only', bad && bad[0]);
}

function assertStableOrdering(caps, label) {
  let prev = '';
  let okLex = true;
  for (const c of caps) {
    const key = `${c.provider}\0${c.method}`;
    if (key < prev) okLex = false;
    prev = key;
  }
  assert(okLex, label);
}

function requiredFields(rows) {
  return rows.every(
    (c) =>
      typeof c.provider === 'string' &&
      typeof c.method === 'string' &&
      typeof c.status === 'string' &&
      typeof c.enabled === 'boolean' &&
      typeof c.maintenance === 'boolean' &&
      Number.isFinite(Number(c.min_amount_minor)) &&
      Number.isFinite(Number(c.max_amount_minor)) &&
      (c.reason_code === null || typeof c.reason_code === 'string'),
  );
}

function main() {
  console.log('Task 15 close-out — payment method capabilities\n');

  assertCapabilityModuleReadOnly();
  assertGetPaymentCapabilityContextReadOnly();

  const regFull = [livePayso, liveKsher, liveStripe];
  const inputBase = {
    query: {},
    registry: { rows: regFull, tableMissing: false },
    context: baseCtx,
  };

  // A. Known enabled method
  const capsA = derivePaymentMethodCapabilities(inputBase);
  const paysoPp = findCap(capsA, 'payso', 'promptpay');
  assert(!!paysoPp && paysoPp.status === CAPABILITY_STATUS.ENABLED && paysoPp.enabled === true, 'A. known enabled method (payso/promptpay)');
  assert(requiredFields(capsA), 'A. response rows carry required fields');
  assertOnlyCanonicalStatuses(capsA, 'A. only canonical capability statuses');

  // B. Disabled method (Stripe path off globally in context — not failover to another PSP row)
  const capsB = derivePaymentMethodCapabilities({
    query: { provider: 'stripe', method: 'card' },
    registry: { rows: regFull, tableMissing: false },
    context: { ...baseCtx, stripeCardEnabled: false },
  });
  assert(
    capsB.length === 1 &&
      capsB[0].status === CAPABILITY_STATUS.DISABLED &&
      capsB[0].reason_code === REASON_CODES.STRIPE_DISABLED,
    'B. disabled method (stripe card when STRIPE path off)',
  );

  // C. Provider maintenance mode
  const capsC = derivePaymentMethodCapabilities({
    query: { provider: 'payso', method: 'promptpay' },
    registry: { rows: regFull, tableMissing: false },
    context: { ...baseCtx, maintenanceProviders: ['payso'] },
  });
  assert(
    capsC.length === 1 &&
      capsC[0].status === CAPABILITY_STATUS.MAINTENANCE &&
      capsC[0].maintenance === true &&
      capsC[0].reason_code === REASON_CODES.PROVIDER_MAINTENANCE,
    'C. provider maintenance mode',
  );

  // D / E amount limits
  const bounds = getDefaultAmountBoundsMinor();
  const capsD = derivePaymentMethodCapabilities({
    query: { provider: 'payso', method: 'promptpay', amount_minor: bounds.min_amount_minor - 1 },
    registry: { rows: regFull, tableMissing: false },
    context: baseCtx,
  });
  assert(capsD[0].status === CAPABILITY_STATUS.DISABLED && capsD[0].reason_code === REASON_CODES.AMOUNT_BELOW_MIN, 'D. amount below minimum');
  const capsE = derivePaymentMethodCapabilities({
    query: { provider: 'payso', method: 'promptpay', amount_minor: bounds.max_amount_minor + 1 },
    registry: { rows: regFull, tableMissing: false },
    context: baseCtx,
  });
  assert(capsE[0].status === CAPABILITY_STATUS.DISABLED && capsE[0].reason_code === REASON_CODES.AMOUNT_ABOVE_MAX, 'E. amount above maximum');

  // F. Unknown payment method
  const capsF = derivePaymentMethodCapabilities({
    query: { provider: 'payso', method: 'bitcoin' },
    registry: { rows: regFull, tableMissing: false },
    context: baseCtx,
  });
  assert(
    capsF.length === 1 &&
      capsF[0].status === CAPABILITY_STATUS.DISABLED &&
      capsF[0].reason_code === REASON_CODES.UNKNOWN_PAYMENT_METHOD,
    'F. unknown payment method → disabled + UNKNOWN_PAYMENT_METHOD',
  );

  // G. Missing registry table — deterministic fallback, no fabricated extras
  const capsG = derivePaymentMethodCapabilities({
    query: {},
    registry: { rows: [], tableMissing: true },
    context: baseCtx,
  });
  assert(
    !!findCap(capsG, 'payso', 'promptpay') &&
      findCap(capsG, 'payso', 'promptpay').status === CAPABILITY_STATUS.ENABLED &&
      findCap(capsG, 'payso', 'promptpay').reason_code === REASON_CODES.GATEWAY_REGISTRY_UNAVAILABLE,
    'G. missing registry table fallback (builtins + informational reason)',
  );
  assert(!findCap(capsG, 'twoc2p', 'psp_integration'), 'G. no extra gateway rows fabricated without registry');
  assertOnlyCanonicalStatuses(capsG, 'G. statuses stay canonical');

  // H. Deterministic ordering
  assertStableOrdering(capsA, 'H. deterministic provider ASC, method ASC');

  // I. Runtime override precedence — registry allows ksher/live but maintenance dominates
  const capsI = derivePaymentMethodCapabilities({
    query: { provider: 'ksher', method: 'promptpay' },
    registry: { rows: regFull, tableMissing: false },
    context: { ...baseCtx, maintenanceProviders: ['ksher'] },
  });
  assert(capsI[0].status === CAPABILITY_STATUS.MAINTENANCE, 'I. runtime maintenance over registry-enabled provider');

  // J. labelled above (+ snapshot callable)
  const snap = getPaymentCapabilityContext();
  assert(snap && Array.isArray(snap.maintenanceProviders), 'J. getPaymentCapabilityContext returns advisory snapshot');

  // K. Provider disabled globally (registry row disables PaySo)
  const regPaysoOff = [{ gateway_id: 'payso', enabled: false, lifecycle: 'live' }, liveKsher, liveStripe];
  const capsK = derivePaymentMethodCapabilities({
    query: { provider: 'payso', method: 'promptpay' },
    registry: { rows: regPaysoOff, tableMissing: false },
    context: baseCtx,
  });
  assert(
    capsK.length === 1 &&
      capsK[0].status === CAPABILITY_STATUS.DISABLED &&
      capsK[0].reason_code === REASON_CODES.GATEWAY_REGISTRY_DISABLED,
    'K. provider disabled globally via registry',
  );

  // L. Replay determinism
  const payload = JSON.parse(JSON.stringify(inputBase));
  const r1 = JSON.stringify(derivePaymentMethodCapabilities(payload));
  const r2 = JSON.stringify(derivePaymentMethodCapabilities(payload));
  const r3 = JSON.stringify(derivePaymentMethodCapabilities(payload));
  assert(r1 === r2 && r2 === r3, 'L. capability query replay determinism');

  // Contract: overlayOperationalGates is pure for fixed inputs (sub-check under H/L)
  const cap0 = findCap(capsA, 'payso', 'promptpay');
  const og1 = JSON.stringify(
    overlayOperationalGates({ ...cap0 }, { maintenanceProviders: new Set(['payso']), paymentGatewayCircuitOpen: false }),
  );
  const og2 = JSON.stringify(
    overlayOperationalGates({ ...cap0 }, { maintenanceProviders: new Set(['payso']), paymentGatewayCircuitOpen: false }),
  );
  assert(og1 === og2, 'H/L. overlay operational gates deterministic');

  // No coupling: builtin matrix lists both QR hosts (informational-only; no hidden routing)
  const nBuilt = builtinMatrixPairs().length;
  assert(capsA.length >= nBuilt, 'Advisory listing includes full builtin matrix (no PSP disappearance)');

  console.log(`\nDone: ${pass} passed${fail ? `, ${fail} FAILED` : ''}`);
  process.exit(fail ? 1 : 0);
}

main();
