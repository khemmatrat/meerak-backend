export function createKnowledgeSync({ ingest, store, skills, marketplace, analyticsEngine, learningEngine, events } = {}) {
  async function emit(name, payload) {
    if (events?.emit) {
      await events.emit({
        name,
        correlationId: 'knowledge-sync',
        source:        { runtimeJobId: null },
        payload,
      }).catch(() => {});
    }
  }

  return {
    async syncAll() {
      const report = { marketplace: 0, skills: 0, runtime: 0, analytics: 0, learning: 0 };

      if (marketplace?.enabled) {
        const mp = await ingest.ingestMarketplaceCatalog(marketplace);
        report.marketplace = mp.ingested;
      }

      if (skills?.registry) {
        for (const skill of skills.registry.listSkills()) {
          await ingest.ingestSkillManifest(skill.manifest);
          report.skills += 1;
        }
      }

      const runtimeMeta = store.setMetadata('runtime_sync', { at: new Date().toISOString() });
      report.runtime = runtimeMeta ? 1 : 0;

      if (analyticsEngine?.enabled) {
        store.setMetadata('analytics_sync', { enabled: true, at: new Date().toISOString() });
        report.analytics = 1;
      }

      if (learningEngine?.enabled) {
        store.setMetadata('learning_sync', { enabled: true, at: new Date().toISOString() });
        report.learning = 1;
      }

      await emit('aivos.knowledge.synced', report);
      return report;
    },
  };
}
