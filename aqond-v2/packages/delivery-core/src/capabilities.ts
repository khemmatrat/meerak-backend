import type { DeliveryCapabilityConfig, DeliveryCapabilityId, DeliveryConfig } from './types';

/** Canonical Delivery Core capability catalog — config-driven, not hardcoded in verticals. */
export const DELIVERY_CORE_CAPABILITY_CATALOG: readonly DeliveryCapabilityConfig[] = [
  {
    id: 'express_rider',
    label: 'Express Rider',
    description: 'On-demand rider dispatch within service areas',
    enabled: true,
  },
  {
    id: 'food_rider',
    label: 'Food Rider',
    description: 'Food-vertical rider dispatch (wired in later phases)',
    enabled: false,
  },
  {
    id: 'parcel_fallback',
    label: 'Parcel Fallback',
    description: 'Carrier parcel when express rider is unavailable',
    enabled: true,
  },
  {
    id: 'future_courier',
    label: 'Future Courier',
    description: 'Reserved for third-party courier integrations',
    enabled: false,
  },
  {
    id: 'same_day_delivery',
    label: 'Same Day Delivery',
    description: 'Same-day scheduled windows',
    enabled: false,
  },
  {
    id: 'scheduled_delivery',
    label: 'Scheduled Delivery',
    description: 'Future dated delivery slots',
    enabled: false,
  },
  {
    id: 'local_delivery',
    label: 'Local Delivery',
    description: 'Metro local rider service — one capability under Delivery Core',
    enabled: true,
  },
] as const;

export const DELIVERY_CORE_MISSION_ID = 'DELIVERY-CORE';

export function defaultCapabilities(): DeliveryCapabilityConfig[] {
  return DELIVERY_CORE_CAPABILITY_CATALOG.map((row) => ({ ...row }));
}

export function mergeCapabilitiesFromConfig(
  raw: unknown,
): DeliveryCapabilityConfig[] {
  const base = defaultCapabilities();
  if (!raw || typeof raw !== 'object') return base;

  const overrides = raw as Record<string, { enabled?: boolean }>;
  return base.map((cap) => {
    const row = overrides[cap.id];
    if (!row || typeof row.enabled !== 'boolean') return cap;
    return { ...cap, enabled: row.enabled };
  });
}

export function listEnabledCapabilities(config: DeliveryConfig): DeliveryCapabilityConfig[] {
  return config.capabilities.filter((cap) => cap.enabled);
}

export function isCapabilityEnabled(
  config: DeliveryConfig,
  capabilityId: DeliveryCapabilityId,
): boolean {
  return config.capabilities.find((cap) => cap.id === capabilityId)?.enabled ?? false;
}
