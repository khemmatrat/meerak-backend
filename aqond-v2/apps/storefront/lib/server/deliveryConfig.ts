import {
  listExpressProvinces,
  listEnabledCapabilities,
  getMaxPickupRadiusKm,
  DELIVERY_CORE_MISSION_ID,
  summarizeProvinceConfiguration,
  listProvincesForApi,
} from '@aqond/delivery-core';
import { deliveryConfigHotReloadMeta, loadServerDeliveryConfig } from '@/lib/server/deliveryConfigStore';

/** Server-only Delivery Core configuration summary. */
export function deliveryConfigSummary() {
  const loaded = loadServerDeliveryConfig();
  const { config, source, path: configPath } = loaded;
  const hotReload = deliveryConfigHotReloadMeta();

  return {
    core: 'delivery-core',
    mission: DELIVERY_CORE_MISSION_ID,
    schema_version: config.schema_version,
    updated_at: config.updated_at,
    max_pickup_radius_km: getMaxPickupRadiusKm(config),
    parcel_fallback_enabled: config.parcel_fallback_enabled,
    matching: config.matching,
    capabilities: config.capabilities,
    enabled_capability_count: listEnabledCapabilities(config).length,
    province_count: config.provinces.length,
    express_province_count: listExpressProvinces(config).length,
    provinces: config.provinces,
    source,
    path: configPath,
    hot_reload: hotReload,
  };
}

/** B2.5-S002 — province configuration surface (read-only). */
export function deliveryProvinceConfiguration() {
  const loaded = loadServerDeliveryConfig();
  const { config } = loaded;
  const hotReload = deliveryConfigHotReloadMeta();

  return {
    core: 'delivery-core',
    mission: DELIVERY_CORE_MISSION_ID,
    scenario: 'B2.5-S002',
    max_pickup_radius_km: getMaxPickupRadiusKm(config),
    summary: summarizeProvinceConfiguration(config),
    provinces: listProvincesForApi(config),
    hot_reload: hotReload,
    source: loaded.source,
    path: loaded.path,
  };
}
