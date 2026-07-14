export type {
  DeliveryCapabilityConfig,
  DeliveryCapabilityId,
  DeliveryConfig,
  DeliveryConfigSource,
  DeliveryMatchingConfig,
  DeliveryMatchingPriority,
  LoadedDeliveryConfig,
  ProvinceDeliveryConfig,
} from './types';

export {
  DELIVERY_CORE_CAPABILITY_CATALOG,
  DELIVERY_CORE_MISSION_ID,
  defaultCapabilities,
  isCapabilityEnabled,
  listEnabledCapabilities,
  mergeCapabilitiesFromConfig,
} from './capabilities';
export { DeliveryConfigError, validateDeliveryConfig } from './validate';
export {
  loadDeliveryConfig,
  loadDeliveryConfigFromObject,
  loadDeliveryConfigFromString,
  type DeliveryConfigLoadOptions,
} from './load';
export {
  getMaxPickupRadiusKm,
  getProvinceConfig,
  isExpressEnabledForProvince,
  isProvinceInServiceArea,
  listEnabledProvinces,
  listExpressProvinces,
  normalizeProvinceCode,
  shouldOfferParcelFallback,
} from './queries';
export {
  DEFAULT_MAX_PICKUP_RADIUS_KM,
  S002_INITIAL_PROVINCE_NAMES_EN,
  isProvinceEnabled,
  listProvincesForApi,
  resolveProvince,
  setProvinceEnabledInConfig,
  setProvinceExpressInConfig,
  summarizeProvinceConfiguration,
  validateInitialProvinceRollout,
  type ProvinceConfigurationSummary,
  type ProvinceLookupInput,
} from './provinceConfig';
export { createHotReloadDeliveryConfig, type HotReloadFs } from './hotReload';
