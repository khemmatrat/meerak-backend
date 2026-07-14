import { isApplicationEnabled, APPLICATION_PHASE } from './config.js';
import { createApplicationRegistry } from './applicationRegistry.js';
import { validateManifest } from './applicationValidator.js';
import { createApplicationCatalog } from './applicationCatalog.js';
import { createApplicationDependency } from './applicationDependency.js';
import { createApplicationInstaller } from './applicationInstaller.js';
import { createApplicationSettings } from './applicationSettings.js';
import { createApplicationProvision } from './applicationProvision.js';
import { createApplicationRuntime } from './applicationRuntime.js';
import { createApplicationLifecycle } from './applicationLifecycle.js';
import { createApplicationMetrics } from './applicationMetrics.js';
import { createApplicationAudit } from './applicationAudit.js';
import { getApplicationTemplate, BUILTIN_APPLICATIONS } from './applicationTemplate.js';
import { normalizeManifest, MANIFEST_FIELDS } from './applicationManifest.js';

function disabledStub() {
  return {
    enabled: false,
    phase: APPLICATION_PHASE,
    catalog: { list: () => [] },
    install: async () => ({ ok: false }),
    execute: async () => ({ ok: false }),
  };
}

export function createApplicationEngine({
  runtime,
  store,
  skills,
  workflows,
  knowledge,
  marketplace,
  billingEngine,
  governance,
  events,
  revenueEngine,
  growthEngine,
} = {}) {
  if (!isApplicationEnabled()) return disabledStub();

  const resolvedStore = store || runtime?.store;
  const registry = createApplicationRegistry({ store: resolvedStore });
  const catalog = createApplicationCatalog();
  const settings = createApplicationSettings({ store: resolvedStore });
  const metrics = createApplicationMetrics();
  const audit = createApplicationAudit({ governance: governance || runtime?.governance });
  const dependency = createApplicationDependency({
    skills: skills || runtime?.skills,
    workflows: workflows || runtime?.workflows,
    knowledge: knowledge || runtime?.knowledge,
    marketplace: marketplace || runtime?.marketplace,
    billingEngine: billingEngine || runtime?.billingEngine,
    governance: governance || runtime?.governance,
  });
  const installer = createApplicationInstaller({
    skills: skills || runtime?.skills,
    workflows: workflows || runtime?.workflows,
    knowledge: knowledge || runtime?.knowledge,
    marketplace: marketplace || runtime?.marketplace,
    registry,
  });
  const lifecycle = createApplicationLifecycle({
    registry,
    installer,
    dependency,
    settings,
    governance: governance || runtime?.governance,
    audit,
    store: resolvedStore,
  });
  const provision = createApplicationProvision({ settings, registry, lifecycle });
  const appRuntime = createApplicationRuntime({
    registry,
    workflows: workflows || runtime?.workflows,
    settings,
    billingEngine: billingEngine || runtime?.billingEngine,
    revenueEngine: revenueEngine || runtime?.revenueEngine,
    metrics,
    store: resolvedStore,
    growthEngine: growthEngine || runtime?.growthEngine,
  });

  if (runtime) appRuntime.attach(runtime);

  const engine = {
    enabled: true,
    phase:   APPLICATION_PHASE,
    registry,
    catalog,
    settings,
    dependency,
    installer,
    provision,
    runtime: appRuntime,
    lifecycle,
    metrics,
    audit,

    validate: (raw) => validateManifest(raw),
    install:  (manifest, opts) => lifecycle.install(manifest, opts),
    uninstall:(appId, opts) => lifecycle.uninstall(appId, opts),
    enable:   (appId, opts) => lifecycle.enable(appId, opts),
    disable:  (appId, opts) => lifecycle.disable(appId, opts),
    upgrade:  (appId, manifest, opts) => lifecycle.upgrade(appId, manifest, opts),
    rollback: (appId, opts) => lifecycle.rollback(appId, opts),
    provision:(manifest, opts) => provision.provision(manifest, opts),
    execute:  (appId, opts) => appRuntime.execute(appId, opts),
    getMetrics: (opts) => metrics.getStats(opts),
    getTemplate: (id) => getApplicationTemplate(id),
  };

  if (runtime) runtime.applications = engine;
  return engine;
}

export {
  isApplicationEnabled,
  APPLICATION_PHASE,
  validateManifest,
  normalizeManifest,
  MANIFEST_FIELDS,
  BUILTIN_APPLICATIONS,
  createApplicationRegistry,
  createApplicationCatalog,
  createApplicationRuntime,
};
