import { isSkillEnabled, SKILL_PHASE } from './config.js';
import { createSkillRegistry } from './skillRegistry.js';
import { validateManifest } from './skillValidator.js';
import { createSkillDependency } from './skillDependency.js';
import { createSkillCapability } from './skillCapability.js';
import { createSkillLoader } from './skillLoader.js';
import { createSkillLifecycle } from './skillLifecycle.js';
import { generateSkillScaffold, VERTICAL_DEFAULTS } from './skillScaffold.js';
import { listSkillTemplates, getSkillTemplate, VERTICAL_SKILL_TEMPLATES } from './skillTemplate.js';
import { normalizeManifest, MANIFEST_FIELDS } from './skillManifest.js';

function disabledStub() {
  return {
    enabled: false,
    phase:   SKILL_PHASE,
    registry: {
      registerSkill: () => ({ ok: false, reason: 'skill_disabled' }),
      removeSkill:   () => ({ ok: false, reason: 'skill_disabled' }),
      listSkills:    () => [],
      findSkill:     () => null,
      enableSkill:   () => ({ ok: false, reason: 'skill_disabled' }),
      disableSkill:  () => ({ ok: false, reason: 'skill_disabled' }),
    },
    validate:       () => ({ ok: false, reason: 'skill_disabled' }),
    resolveDeps:    async () => ({ ok: false, reason: 'skill_disabled' }),
    capabilities:   { listCapabilities: () => [], lookup: () => ({ matchedSkills: [] }) },
    loader:         { loadSkill: async () => null, unloadSkill: async () => null, reloadSkill: async () => null, listLoaded: () => [] },
    install:        async () => ({ ok: false, reason: 'skill_disabled' }),
    enable:         async () => ({ ok: false, reason: 'skill_disabled' }),
    disable:        async () => ({ ok: false, reason: 'skill_disabled' }),
    upgrade:        async () => ({ ok: false, reason: 'skill_disabled' }),
    rollback:       async () => ({ ok: false, reason: 'skill_disabled' }),
    uninstall:      async () => ({ ok: false, reason: 'skill_disabled' }),
    scaffold:       () => ({ ok: false, reason: 'skill_disabled' }),
    templates:      () => [],
    discover:       () => [],
  };
}

export function createSkillEngine({
  runtime,
  store,
  registry,
  marketplace,
  billingEngine,
  governance,
  pipeline,
  events,
} = {}) {
  if (!isSkillEnabled()) return disabledStub();

  const resolvedStore = store || runtime?.store;
  const resolvedRegistry = registry || runtime?.registry;
  const skillRegistry = createSkillRegistry({ store: resolvedStore });
  const capability = createSkillCapability({ runtime: runtime || { skills: null } });
  const dependency = createSkillDependency({
    store: resolvedStore,
    marketplace: marketplace || runtime?.marketplace,
    billingEngine: billingEngine || runtime?.billingEngine,
    governance: governance || runtime?.governance,
    pipeline: pipeline || runtime?.pipeline,
  });
  const loader = createSkillLoader({
    store: resolvedStore,
    registry: resolvedRegistry,
    capability,
  });
  const lifecycle = createSkillLifecycle({
    registry: skillRegistry,
    dependency,
    loader,
    marketplace: marketplace || runtime?.marketplace,
    governance: governance || runtime?.governance,
    events: events || runtime?.events,
  });

  if (runtime) {
    runtime.skills = null;
  }

  const engine = {
    enabled: true,
    phase:   SKILL_PHASE,
    registry: skillRegistry,
    capability,
    dependency,
    loader,
    validate:       (raw) => validateManifest(raw),
    resolveDeps:    (manifest, opts) => dependency.resolve(manifest, opts),
    install:        (manifest, opts) => lifecycle.install(manifest, opts),
    enable:         (skillId) => lifecycle.enable(skillId),
    disable:        (skillId) => lifecycle.disable(skillId),
    upgrade:        (skillId, version) => lifecycle.upgrade(skillId, version),
    rollback:       (skillId) => lifecycle.rollback(skillId),
    uninstall:      (skillId) => lifecycle.uninstall(skillId),
    loadSkill:      (record) => loader.loadSkill(record),
    unloadSkill:    (skillId) => loader.unloadSkill(skillId),
    reloadSkill:    (record) => loader.reloadSkill(record),
    scaffold:       (opts) => generateSkillScaffold(opts),
    templates:      () => listSkillTemplates(),
    getTemplate:    (id) => getSkillTemplate(id),
    discover() {
      return skillRegistry.listSkills({ enabled: true }).map((s) => s.id);
    },
  };

  if (runtime) {
    runtime.skills = engine;
    capability.runtime = runtime;
  }

  return engine;
}

export {
  isSkillEnabled,
  SKILL_PHASE,
  validateManifest,
  normalizeManifest,
  MANIFEST_FIELDS,
  generateSkillScaffold,
  VERTICAL_DEFAULTS,
  listSkillTemplates,
  getSkillTemplate,
  VERTICAL_SKILL_TEMPLATES,
  createSkillRegistry,
  createSkillDependency,
  createSkillCapability,
  createSkillLoader,
  createSkillLifecycle,
};
