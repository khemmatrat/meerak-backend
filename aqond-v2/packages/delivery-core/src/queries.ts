import type { DeliveryConfig, ProvinceDeliveryConfig } from './types';

export function normalizeProvinceCode(code: string): string {
  const trimmed = String(code ?? '').trim();
  if (!trimmed) return '';
  return trimmed.padStart(2, '0');
}

export function getProvinceConfig(
  config: DeliveryConfig,
  provinceCode: string,
): ProvinceDeliveryConfig | null {
  const normalized = normalizeProvinceCode(provinceCode);
  if (!normalized) return null;
  return config.provinces.find((p) => p.province_code === normalized) ?? null;
}

export function isProvinceInServiceArea(config: DeliveryConfig, provinceCode: string): boolean {
  const province = getProvinceConfig(config, provinceCode);
  return Boolean(province?.enabled);
}

export function isExpressEnabledForProvince(config: DeliveryConfig, provinceCode: string): boolean {
  const province = getProvinceConfig(config, provinceCode);
  if (!province?.enabled) return false;
  return province.express_enabled;
}

export function shouldOfferParcelFallback(
  config: DeliveryConfig,
  provinceCode: string,
): boolean {
  if (!config.parcel_fallback_enabled) return false;
  const province = getProvinceConfig(config, provinceCode);
  if (!province) return config.parcel_fallback_enabled;
  if (!province.enabled) return province.parcel_fallback;
  if (!province.express_enabled) return province.parcel_fallback;
  return false;
}

export function listEnabledProvinces(config: DeliveryConfig): ProvinceDeliveryConfig[] {
  return config.provinces.filter((p) => p.enabled);
}

export function listExpressProvinces(config: DeliveryConfig): ProvinceDeliveryConfig[] {
  return config.provinces.filter((p) => p.enabled && p.express_enabled);
}

export function getMaxPickupRadiusKm(config: DeliveryConfig): number {
  return config.max_pickup_radius_km;
}
