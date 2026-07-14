const DEFAULT_PLUGINS = Object.freeze([
  {
    package_id:       'resume-ai',
    type:             'plugin',
    version:          '1.0.0',
    capabilities:     ['video.talent_intro', 'ocr.pdf', 'profile.analyze'],
    required_plugins: [],
    required_skills:  ['resume-extract-profile'],
    credit_multiplier: 1.0,
    billing_profile:   'ai_video_credits',
  },
]);

const DEFAULT_WORKFLOWS = Object.freeze([
  {
    package_id:       'video-pipeline-v1',
    type:             'workflow',
    version:          '1.0.0',
    required_plugins: ['resume-ai'],
    required_skills:  ['resume-extract-profile'],
    dag_template:     { nodes: ['ocr', 'transcribe', 'brief', 'script', 'render', 'publish'] },
    min_tier:         'standard',
  },
]);

function ensureTables(store) {
  if (store.kind !== 'memory') return null;
  if (!store._tables.marketplacePackages) store._tables.marketplacePackages = new Map();
  if (!store._tables.marketplaceWorkflows) store._tables.marketplaceWorkflows = new Map();
  return store._tables;
}

export function createMarketplaceCatalog({ store }) {
  return {
    listPlugins() {
      const tables = ensureTables(store);
      const installed = tables
        ? [...tables.marketplacePackages.values()].filter((p) => p.type === 'plugin')
        : [];
      return [...DEFAULT_PLUGINS, ...installed.filter((i) => !DEFAULT_PLUGINS.some((d) => d.package_id === i.package_id))];
    },

    listWorkflows() {
      const tables = ensureTables(store);
      const installed = tables
        ? [...tables.marketplaceWorkflows.values()]
        : [];
      return [...DEFAULT_WORKFLOWS, ...installed.filter((i) => !DEFAULT_WORKFLOWS.some((d) => d.package_id === i.package_id))];
    },

    getPackage(packageId, type) {
      const catalog = type === 'workflow' ? DEFAULT_WORKFLOWS : DEFAULT_PLUGINS;
      const fromCatalog = catalog.find((p) => p.package_id === packageId);
      const tables = ensureTables(store);
      if (!tables) return fromCatalog || null;
      const map = type === 'workflow' ? tables.marketplaceWorkflows : tables.marketplacePackages;
      return map.get(packageId) || fromCatalog || null;
    },

    ensureTables,
  };
}

export { DEFAULT_PLUGINS, DEFAULT_WORKFLOWS };
