import {
  RETURN_REFUND_CORE_MISSION_ID,
  listEnabledCapabilities,
  listEnabledReturnMethods,
  RETURN_REASON_OPTIONS,
  ORDER_RESOLUTION_TABS,
} from '@aqond/return-core';
import { loadServerReturnConfig } from '@/lib/server/returnConfigStore';

/** Server-only Return Core configuration summary. */
export function returnConfigSummary() {
  const loaded = loadServerReturnConfig();
  const { config, source, path: configPath } = loaded;

  return {
    core: 'return-core',
    mission: RETURN_REFUND_CORE_MISSION_ID,
    schema_version: config.schema_version,
    core_version: config.core_version,
    updated_at: config.updated_at,
    vertical: config.vertical,
    escrow: config.escrow,
    auto_refund_policy: config.auto_refund_policy,
    return_methods: config.return_methods,
    enabled_return_methods: listEnabledReturnMethods(config),
    order_tabs: config.order_tabs,
    resolution_tabs: ORDER_RESOLUTION_TABS,
    reason_options: RETURN_REASON_OPTIONS,
    capabilities: config.capabilities,
    enabled_capability_count: listEnabledCapabilities(config).length,
    source,
    path: configPath,
  };
}
