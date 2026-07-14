/** AQOND Delivery Core configuration — shared across Marketplace, Food, Talent, Merchant, and future services. */

export type DeliveryMatchingPriority =
  | 'distance_km'
  | 'rider_available'
  | 'score'
  | 'avg_accept_seconds'
  | 'acceptance_rate';

/** Delivery Core capabilities — Local Delivery is one capability, not the module name. */
export type DeliveryCapabilityId =
  | 'express_rider'
  | 'food_rider'
  | 'parcel_fallback'
  | 'future_courier'
  | 'same_day_delivery'
  | 'scheduled_delivery'
  | 'local_delivery';

export type DeliveryCapabilityConfig = {
  id: DeliveryCapabilityId;
  label: string;
  description: string;
  enabled: boolean;
};

export type ProvinceDeliveryConfig = {
  province_code: string;
  name_th: string;
  name_en: string;
  alias_en?: string;
  alias_th?: string;
  rollout_phase: 1 | 2;
  enabled: boolean;
  express_enabled: boolean;
  parcel_fallback: boolean;
};

export type DeliveryMatchingConfig = {
  sort_priority: DeliveryMatchingPriority[];
};

export type DeliveryConfig = {
  schema_version: number;
  updated_at: string;
  max_pickup_radius_km: number;
  parcel_fallback_enabled: boolean;
  matching: DeliveryMatchingConfig;
  capabilities: DeliveryCapabilityConfig[];
  provinces: ProvinceDeliveryConfig[];
};

export type DeliveryConfigSource =
  | 'env_json'
  | 'env_path'
  | 'local_dev_file'
  | 'default_json'
  | 'redis';

export type LoadedDeliveryConfig = {
  config: DeliveryConfig;
  source: DeliveryConfigSource;
  path?: string;
};
