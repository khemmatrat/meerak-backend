import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = process.env.AGK_DATA_DIR || path.join(ROOT, 'data');
const SERVICES_FILE = path.join(DATA_DIR, 'service-registry.json');
const TENANTS_FILE = path.join(DATA_DIR, 'tenant-registry.json');

const SEED_TENANTS = [
  { tenant_id: 'aqond-platform', name: 'AQOND Platform', tier: 'platform', status: 'active' },
  { tenant_id: 'restaurant-0001', name: 'Restaurant Demo A', tier: 'merchant', status: 'active' },
  { tenant_id: 'restaurant-0002', name: 'Restaurant Demo B', tier: 'merchant', status: 'active' },
];

const SEED_SERVICES = [
  { service_id: 'marketplace-v2', tenant_id: 'aqond-platform', capabilities: ['catalog', 'search'], status: 'active' },
  { service_id: 'wallet-v3', tenant_id: 'aqond-platform', capabilities: ['balance', 'transfer'], status: 'active' },
  { service_id: 'food-v5', tenant_id: 'restaurant-0001', capabilities: ['menu', 'orders'], status: 'active' },
  { service_id: 'food-v5-b', tenant_id: 'restaurant-0002', capabilities: ['menu', 'orders'], status: 'active' },
];

const SEED_BINDINGS = [
  { ai_id: 'jarvis-prod-01', tenant_id: 'aqond-platform', service_id: 'marketplace-v2' },
  { ai_id: 'hermes-worker-01', tenant_id: 'aqond-platform', service_id: 'marketplace-v2' },
  { ai_id: 'hermes-worker-04', tenant_id: 'restaurant-0001', service_id: 'food-v5' },
];

function loadJson(file, seed) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(file)) {
    fs.writeFileSync(file, JSON.stringify(seed, null, 2));
    return seed;
  }
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return seed;
  }
}

function saveJson(file, data) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

let tenants = loadJson(TENANTS_FILE, { version: 1, tenants: SEED_TENANTS });
let services = loadJson(SERVICES_FILE, { version: 1, services: SEED_SERVICES, bindings: SEED_BINDINGS });

export function getTenant(tenantId) {
  return tenants.tenants.find((t) => t.tenant_id === tenantId) || null;
}

export function getService(serviceId) {
  return services.services.find((s) => s.service_id === serviceId) || null;
}

export function resolveAiHierarchy(aiId) {
  const binding = services.bindings.find((b) => b.ai_id === aiId);
  if (!binding) return null;
  const service = getService(binding.service_id);
  const tenant = getTenant(binding.tenant_id);
  return {
    ai_id: aiId,
    service_id: binding.service_id,
    tenant_id: binding.tenant_id,
    service,
    tenant,
  };
}

export function registerService(input = {}) {
  const serviceId = String(input.service_id || '').trim();
  const tenantId = String(input.tenant_id || '').trim();
  if (!serviceId || !tenantId) return { ok: false, error: 'service_id and tenant_id required' };
  if (!getTenant(tenantId)) return { ok: false, error: 'tenant_not_found' };

  let svc = getService(serviceId);
  if (!svc) {
    svc = {
      service_id: serviceId,
      tenant_id: tenantId,
      capabilities: input.capabilities || [],
      status: 'registered',
      registered_at: new Date().toISOString(),
    };
    services.services.push(svc);
  }
  saveJson(SERVICES_FILE, services);
  return { ok: true, service: svc };
}

export function bindAiToService(aiId, serviceId, tenantId) {
  const svc = getService(serviceId);
  if (!svc || svc.tenant_id !== tenantId) return { ok: false, error: 'service_tenant_mismatch' };
  const existing = services.bindings.find((b) => b.ai_id === aiId);
  if (existing) {
    existing.service_id = serviceId;
    existing.tenant_id = tenantId;
  } else {
    services.bindings.push({ ai_id: aiId, service_id: serviceId, tenant_id: tenantId });
  }
  saveJson(SERVICES_FILE, services);
  return { ok: true };
}

/**
 * Tenant isolation — caller tenant cannot access target service tenant (even admin).
 */
export function checkTenantIsolation(input = {}) {
  const callerTenant = input.caller_tenant_id || input.tenant_id;
  const targetService = input.target_service_id || input.service_id;
  const targetTenant = input.target_tenant_id;

  if (!callerTenant) {
    return { ok: false, code: 'guardian.denied', reason: 'tenant.missing', policy_key: 'P_3010' };
  }

  let resolvedTargetTenant = targetTenant;
  if (targetService) {
    const svc = getService(targetService);
    if (!svc) return { ok: false, code: 'guardian.not_found', reason: 'service.unknown' };
    resolvedTargetTenant = svc.tenant_id;
  }

  if (!resolvedTargetTenant) {
    return { ok: false, code: 'guardian.denied', reason: 'tenant.target_missing', policy_key: 'P_3010' };
  }

  if (callerTenant === 'aqond-platform' && input.platform_scope === true) {
    return { ok: true, policy_key: 'P_1001' };
  }

  if (callerTenant !== resolvedTargetTenant) {
    return {
      ok: false,
      code: 'guardian.denied',
      reason: 'tenant.isolation_violation',
      policy_key: 'P_3001',
      caller_tenant: callerTenant,
      target_tenant: resolvedTargetTenant,
    };
  }

  return { ok: true, policy_key: 'P_1001' };
}

export function hierarchyHealth() {
  return {
    status: 'up',
    tenants: tenants.tenants.length,
    services: services.services.length,
    bindings: services.bindings.length,
  };
}
