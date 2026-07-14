import { isMarketplaceEnabled } from './config.js';
import { createMarketplaceCatalog } from './catalog.js';
import { createDependencyResolver } from './dependencyResolver.js';
import { createMarketplaceLifecycle } from './lifecycle.js';

function disabledStub() {
  return {
    enabled: false,
    listPlugins:    () => [],
    listWorkflows:  () => [],
    listInstalled:  async () => [],
    install:        async () => ({ ok: false, reason: 'marketplace_disabled' }),
    enable:         async () => ({ ok: false, reason: 'marketplace_disabled' }),
    disable:        async () => ({ ok: false, reason: 'marketplace_disabled' }),
    upgrade:        async () => ({ ok: false, reason: 'marketplace_disabled' }),
    rollback:       async () => ({ ok: false, reason: 'marketplace_disabled' }),
    suspend:        async () => ({ ok: false, reason: 'marketplace_disabled' }),
    resume:         async () => ({ ok: false, reason: 'marketplace_disabled' }),
    remove:         async () => ({ ok: false, reason: 'marketplace_disabled' }),
  };
}

export function createMarketplaceEngine({ store, events, getBillingEngine, getGovernanceEngine } = {}) {
  if (!isMarketplaceEnabled()) return disabledStub();

  const catalog  = createMarketplaceCatalog({ store });
  const resolver = createDependencyResolver({ store, getBillingEngine });
  const lifecycle = createMarketplaceLifecycle({ store, catalog, events, resolver, getBillingEngine, getGovernanceEngine });

  return {
    enabled: true,
    listPlugins:   () => catalog.listPlugins(),
    listWorkflows: () => catalog.listWorkflows(),
    listInstalled: async () => {
      const tables = catalog.ensureTables(store);
      if (!tables) return [];
      return [
        ...tables.marketplacePackages.values(),
        ...tables.marketplaceWorkflows.values(),
      ].filter((p) => p.state !== 'deleted');
    },
    install:  (opts) => lifecycle.install(opts),
    enable:   (opts) => lifecycle.enable(opts),
    disable:  (opts) => lifecycle.disable(opts),
    upgrade:  (opts) => lifecycle.upgrade(opts),
    rollback: (opts) => lifecycle.rollback(opts),
    suspend:  (opts) => lifecycle.suspend(opts),
    resume:   (opts) => lifecycle.resume(opts),
    remove:   (opts) => lifecycle.remove(opts),
  };
}

export { createMarketplaceEngine as createMarketplace };
export { isMarketplaceEnabled } from './config.js';
