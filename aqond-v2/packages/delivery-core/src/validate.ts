import type { DeliveryConfig, DeliveryMatchingPriority } from './types';
import { mergeCapabilitiesFromConfig } from './capabilities';

const ALLOWED_PRIORITIES: DeliveryMatchingPriority[] = [
  'distance_km',
  'rider_available',
  'score',
  'avg_accept_seconds',
  'acceptance_rate',
];

export class DeliveryConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DeliveryConfigError';
  }
}

export function validateDeliveryConfig(raw: unknown): DeliveryConfig {
  if (!raw || typeof raw !== 'object') {
    throw new DeliveryConfigError('config must be an object');
  }

  const cfg = raw as Record<string, unknown>;

  if (cfg.schema_version !== 1 && cfg.schema_version !== 2) {
    throw new DeliveryConfigError('schema_version must be 1 or 2');
  }

  const radius = cfg.max_pickup_radius_km;
  if (typeof radius !== 'number' || radius <= 0) {
    throw new DeliveryConfigError('max_pickup_radius_km must be a positive number');
  }

  if (typeof cfg.parcel_fallback_enabled !== 'boolean') {
    throw new DeliveryConfigError('parcel_fallback_enabled must be boolean');
  }

  if (typeof cfg.updated_at !== 'string' || !cfg.updated_at) {
    throw new DeliveryConfigError('updated_at must be a non-empty string');
  }

  const matching = cfg.matching;
  if (!matching || typeof matching !== 'object') {
    throw new DeliveryConfigError('matching must be an object');
  }

  const sortPriority = (matching as Record<string, unknown>).sort_priority;
  if (!Array.isArray(sortPriority) || sortPriority.length === 0) {
    throw new DeliveryConfigError('matching.sort_priority must be a non-empty array');
  }

  for (const item of sortPriority) {
    if (!ALLOWED_PRIORITIES.includes(item as DeliveryMatchingPriority)) {
      throw new DeliveryConfigError(`invalid matching priority: ${String(item)}`);
    }
  }

  if (!Array.isArray(cfg.provinces) || cfg.provinces.length === 0) {
    throw new DeliveryConfigError('provinces must be a non-empty array');
  }

  const seen = new Set<string>();
  const provinces = cfg.provinces.map((p, idx) => {
    if (!p || typeof p !== 'object') {
      throw new DeliveryConfigError(`provinces[${idx}] must be an object`);
    }
    const row = p as Record<string, unknown>;
    const code = String(row.province_code ?? '').trim();
    if (!/^\d{1,2}$/.test(code)) {
      throw new DeliveryConfigError(`provinces[${idx}].province_code invalid`);
    }
    if (seen.has(code)) {
      throw new DeliveryConfigError(`duplicate province_code: ${code}`);
    }
    seen.add(code);

    const phase = row.rollout_phase;
    if (phase !== 1 && phase !== 2) {
      throw new DeliveryConfigError(`provinces[${idx}].rollout_phase must be 1 or 2`);
    }

    for (const key of ['name_th', 'name_en'] as const) {
      if (typeof row[key] !== 'string' || !row[key]) {
        throw new DeliveryConfigError(`provinces[${idx}].${key} must be a non-empty string`);
      }
    }

    for (const key of ['enabled', 'express_enabled', 'parcel_fallback'] as const) {
      if (typeof row[key] !== 'boolean') {
        throw new DeliveryConfigError(`provinces[${idx}].${key} must be boolean`);
      }
    }

    const aliasEn = row.alias_en;
    if (aliasEn != null && (typeof aliasEn !== 'string' || !aliasEn)) {
      throw new DeliveryConfigError(`provinces[${idx}].alias_en must be a non-empty string when set`);
    }
    const aliasTh = row.alias_th;
    if (aliasTh != null && (typeof aliasTh !== 'string' || !aliasTh)) {
      throw new DeliveryConfigError(`provinces[${idx}].alias_th must be a non-empty string when set`);
    }

    return {
      province_code: code,
      name_th: row.name_th as string,
      name_en: row.name_en as string,
      alias_en: aliasEn as string | undefined,
      alias_th: aliasTh as string | undefined,
      rollout_phase: phase as 1 | 2,
      enabled: row.enabled as boolean,
      express_enabled: row.express_enabled as boolean,
      parcel_fallback: row.parcel_fallback as boolean,
    };
  });

  return {
    schema_version: cfg.schema_version as number,
    updated_at: cfg.updated_at as string,
    max_pickup_radius_km: radius,
    parcel_fallback_enabled: cfg.parcel_fallback_enabled as boolean,
    matching: {
      sort_priority: sortPriority as DeliveryMatchingPriority[],
    },
    capabilities: mergeCapabilitiesFromConfig(cfg.capabilities),
    provinces,
  };
}
