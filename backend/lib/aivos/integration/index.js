import {
  isIntegrationEnabled,
  isApiGatewayEnabled,
  isWebhookEnabled,
  isOAuthEnabled,
  INTEGRATION_PHASE,
} from './config.js';
import { createConnectorRegistry } from './connectorRegistry.js';
import { validateManifest, normalizeManifest, MANIFEST_FIELDS } from './connectorManifest.js';
import { createConnectorDependency } from './connectorDependency.js';
import { createConnectorInstaller } from './connectorInstaller.js';
import { createCredentialVault } from './credentialVault.js';
import { createOAuthManager } from './oauthManager.js';
import { createWebhookEngine } from './webhookEngine.js';
import { createApiGateway } from './apiGateway.js';
import { createConnectorRuntime } from './connectorRuntime.js';
import { createIntegrationFlow } from './integrationFlow.js';
import { createEventBridge } from './eventBridge.js';
import { createIntegrationMetrics } from './integrationMetrics.js';
import { createIntegrationAudit } from './integrationAudit.js';
import { createIntegrationHealth } from './integrationHealth.js';
import { getConnectorTemplate, listConnectorTemplates, BUILTIN_CONNECTORS } from './connectorCatalog.js';

function disabledStub() {
  return {
    enabled: false,
    phase: INTEGRATION_PHASE,
    registry: { list: () => [], find: () => null },
    install: async () => ({ ok: false }),
    execute: async () => ({ ok: false }),
    call: async () => ({ ok: false }),
  };
}

export function createIntegrationEngine({
  runtime,
  store,
  marketplace,
  workflows,
  applications,
  knowledge,
  skills,
  billingEngine,
  governance,
  tenants,
  automation,
  analyticsEngine,
  revenueEngine,
  events,
} = {}) {
  if (!isIntegrationEnabled()) return disabledStub();

  const resolvedStore = store || runtime?.store;
  const registry = createConnectorRegistry({ store: resolvedStore });
  const vault = createCredentialVault({ store: resolvedStore });
  const metrics = createIntegrationMetrics();
  const audit = createIntegrationAudit({ governance: governance || runtime?.governance });
  const oauth = createOAuthManager({ store: resolvedStore, vault, isEnabled: isOAuthEnabled() });
  const webhookEngine = createWebhookEngine({ store: resolvedStore, isEnabled: isWebhookEnabled() });
  const dependency = createConnectorDependency({
    workflows: workflows || runtime?.workflows,
    applications: applications || runtime?.applications,
    marketplace: marketplace || runtime?.marketplace,
    billingEngine: billingEngine || runtime?.billingEngine,
    knowledge: knowledge || runtime?.knowledge,
    skills: skills || runtime?.skills,
    tenants: tenants || runtime?.tenants,
  });
  const installer = createConnectorInstaller({
    registry,
    dependency,
    marketplace: marketplace || runtime?.marketplace,
    vault,
    audit,
    store: resolvedStore,
  });
  const gateway = createApiGateway({
    tenants: tenants || runtime?.tenants,
    oauth,
    registry,
    isEnabled: isApiGatewayEnabled(),
  });
  const connectorRuntime = createConnectorRuntime({
    registry,
    vault,
    oauth,
    workflows: workflows || runtime?.workflows,
    applications: applications || runtime?.applications,
    gateway,
    metrics,
    audit,
    billingEngine: billingEngine || runtime?.billingEngine,
    revenueEngine: revenueEngine || runtime?.revenueEngine,
  });
  const flow = createIntegrationFlow({
    connectorRuntime,
    workflows: workflows || runtime?.workflows,
    automation: automation || runtime?.automationEngine,
    analyticsEngine: analyticsEngine || runtime?.analyticsEngine,
    revenueEngine: revenueEngine || runtime?.revenueEngine,
    audit,
  });
  const eventBridge = createEventBridge({
    events: events || runtime?.events,
    webhookEngine,
    connectorRuntime,
    workflows: workflows || runtime?.workflows,
  });
  const health = createIntegrationHealth({ registry, webhookEngine, oauth });

  connectorRuntime.attach(runtime);

  const engine = {
    enabled: true,
    phase: INTEGRATION_PHASE,
    registry,
    vault,
    oauth,
    webhook: webhookEngine,
    gateway,
    dependency,
    installer,
    runtime: connectorRuntime,
    flow,
    eventBridge,
    metrics,
    audit,
    health,

    validate: (raw) => validateManifest(raw),
    getTemplate: (id) => getConnectorTemplate(id),
    listTemplates: () => listConnectorTemplates(),
    install: (manifest, opts) => installer.install(manifest, opts),
    uninstall: (id, opts) => installer.uninstall(id, opts),
    upgrade: (id, manifest, opts) => installer.upgrade(id, manifest, opts),
    rollback: (id, opts) => installer.rollback(id, opts),
    execute: (id, opts) => connectorRuntime.execute(id, opts),
    call: (id, opts) => connectorRuntime.call(id, opts),
    invoke: (id, opts) => connectorRuntime.invoke(id, opts),
    getMetrics: (opts) => metrics.getStats(opts),
    getHealth: (opts) => health.summary(opts),
  };

  if (runtime) runtime.integrations = engine;
  return engine;
}

export {
  isIntegrationEnabled,
  isApiGatewayEnabled,
  isWebhookEnabled,
  isOAuthEnabled,
  INTEGRATION_PHASE,
  validateManifest,
  normalizeManifest,
  MANIFEST_FIELDS,
  BUILTIN_CONNECTORS,
  createConnectorRegistry,
  createConnectorRuntime,
};
