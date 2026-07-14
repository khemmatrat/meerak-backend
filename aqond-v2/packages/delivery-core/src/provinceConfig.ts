import type { DeliveryConfig, ProvinceDeliveryConfig } from './types';
import { getMaxPickupRadiusKm, getProvinceConfig, normalizeProvinceCode } from './queries';

export const DEFAULT_MAX_PICKUP_RADIUS_KM = 12;

/** Initial S002 rollout province names (configuration seed — not used in runtime logic). */
export const S002_INITIAL_PROVINCE_NAMES_EN = [
  'Bangkok',
  'Nonthaburi',
  'Pathum Thani',
  'Samut Prakan',
  'Samut Sakhon',
  'Phuket',
  'Krabi',
  'Chiang Mai',
  'Nakhon Ratchasima',
  'Khon Kaen',
  'Surat Thani',
  'Hat Yai',
  'Ratchaburi',
  'Chonburi',
  'Rayong',
] as const;

export type ProvinceLookupInput = {
  province_code?: string;
  name_en?: string;
  alias_en?: string;
};

export type ProvinceConfigurationSummary = {
  max_pickup_radius_km: number;
  total_provinces: number;
  enabled_count: number;
  disabled_count: number;
  express_enabled_count: number;
  rollout_phase_1_count: number;
  rollout_phase_2_count: number;
};

function normalizeLookup(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, '');
}

export function resolveProvince(
  config: DeliveryConfig,
  input: ProvinceLookupInput,
): ProvinceDeliveryConfig | null {
  if (input.province_code) {
    return getProvinceConfig(config, input.province_code);
  }

  const name = input.name_en ? normalizeLookup(input.name_en) : '';
  const alias = input.alias_en ? normalizeLookup(input.alias_en) : '';

  for (const province of config.provinces) {
    if (name && normalizeLookup(province.name_en) === name) return province;
    if (alias && province.alias_en && normalizeLookup(province.alias_en) === alias) {
      return province;
    }
    if (alias && normalizeLookup(province.name_en) === alias) return province;
  }

  return null;
}

export function isProvinceEnabled(config: DeliveryConfig, provinceCode: string): boolean {
  const province = getProvinceConfig(config, provinceCode);
  return Boolean(province?.enabled);
}

export function setProvinceEnabledInConfig(
  config: DeliveryConfig,
  provinceCode: string,
  enabled: boolean,
): DeliveryConfig {
  const code = normalizeProvinceCode(provinceCode);
  return {
    ...config,
    provinces: config.provinces.map((row) =>
      row.province_code === code ? { ...row, enabled } : row,
    ),
  };
}

export function setProvinceExpressInConfig(
  config: DeliveryConfig,
  provinceCode: string,
  expressEnabled: boolean,
): DeliveryConfig {
  const code = normalizeProvinceCode(provinceCode);
  return {
    ...config,
    provinces: config.provinces.map((row) =>
      row.province_code === code ? { ...row, express_enabled: expressEnabled } : row,
    ),
  };
}

export function summarizeProvinceConfiguration(config: DeliveryConfig): ProvinceConfigurationSummary {
  const enabled = config.provinces.filter((p) => p.enabled);
  const express = enabled.filter((p) => p.express_enabled);
  return {
    max_pickup_radius_km: getMaxPickupRadiusKm(config),
    total_provinces: config.provinces.length,
    enabled_count: enabled.length,
    disabled_count: config.provinces.length - enabled.length,
    express_enabled_count: express.length,
    rollout_phase_1_count: config.provinces.filter((p) => p.rollout_phase === 1).length,
    rollout_phase_2_count: config.provinces.filter((p) => p.rollout_phase === 2).length,
  };
}

export function listProvincesForApi(config: DeliveryConfig): ProvinceDeliveryConfig[] {
  return [...config.provinces].sort((a, b) => a.province_code.localeCompare(b.province_code));
}

export function validateInitialProvinceRollout(config: DeliveryConfig): string[] {
  const errors: string[] = [];

  if (getMaxPickupRadiusKm(config) !== DEFAULT_MAX_PICKUP_RADIUS_KM) {
    errors.push(`max_pickup_radius_km must default to ${DEFAULT_MAX_PICKUP_RADIUS_KM}`);
  }

  const enabledNames = new Set(
    config.provinces.filter((p) => p.enabled).map((p) => normalizeLookup(p.name_en)),
  );
  const enabledAliases = new Set(
    config.provinces
      .filter((p) => p.enabled && p.alias_en)
      .map((p) => normalizeLookup(p.alias_en as string)),
  );

  for (const name of S002_INITIAL_PROVINCE_NAMES_EN) {
    const key = normalizeLookup(name);
    if (!enabledNames.has(key) && !enabledAliases.has(key)) {
      errors.push(`initial province not enabled: ${name}`);
    }
  }

  return errors;
}
