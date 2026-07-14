export function createKnowledgeIngest({ store, embeddingIndex, entityRegistry, graph, version } = {}) {
  const parsers = {
    markdown: (body) => body,
    json:     (body) => (typeof body === 'string' ? JSON.stringify(JSON.parse(body)) : JSON.stringify(body)),
    csv:      (body) => String(body).split('\n').map((line) => line.trim()).filter(Boolean).join(' '),
    pdf:      (body) => String(body),
    text:     (body) => String(body),
  };

  return {
    async ingestDocument({ title, body, format = 'text', metadata = {} } = {}) {
      const normalized = parsers[format] ? parsers[format](body) : String(body);
      const doc = store.insertDocument({ title, body: normalized, format, metadata });
      embeddingIndex.indexDocument(doc);
      if (metadata.entityId) {
        version?.snapshotEntity?.(metadata.entityId, { documentId: doc.id, title });
      }
      return doc;
    },

    async ingestJson(payload) {
      const body = typeof payload === 'string' ? payload : JSON.stringify(payload);
      return this.ingestDocument({ title: payload?.title || 'json-import', body, format: 'json', metadata: payload?.metadata || {} });
    },

    async ingestCsv(body, { title = 'csv-import', metadata = {} } = {}) {
      return this.ingestDocument({ title, body, format: 'csv', metadata });
    },

    async ingestMarkdown({ title, body, metadata = {} } = {}) {
      return this.ingestDocument({ title, body, format: 'markdown', metadata });
    },

    async ingestApi({ url, data, metadata = {} } = {}) {
      const body = data ? JSON.stringify(data) : `api:${url || 'unknown'}`;
      return this.ingestDocument({ title: metadata.title || 'api-import', body, format: 'json', metadata: { ...metadata, source: 'api', url } });
    },

    async ingestMarketplaceCatalog(marketplace) {
      if (!marketplace?.enabled) return { ingested: 0 };
      const plugins = marketplace.listPlugins?.() || [];
      const workflows = marketplace.listWorkflows?.() || [];
      let ingested = 0;
      for (const pkg of [...plugins, ...workflows]) {
        await this.ingestDocument({
          title: pkg.package_id,
          body:  JSON.stringify(pkg),
          format: 'json',
          metadata: { source: 'marketplace', packageId: pkg.package_id, type: pkg.type },
        });
        entityRegistry.register({
          id:   `merchant:${pkg.package_id}`,
          type: 'merchant',
          name: pkg.package_id,
          metadata: { package: pkg },
        });
        ingested += 1;
      }
      return { ingested };
    },

    async ingestSkillManifest(manifest) {
      const entity = entityRegistry.register({
        id:   manifest.id,
        type: 'skill',
        name: manifest.name,
        capabilities: manifest.capabilities || [],
        metadata: { manifest },
      });
      graph.addNode(entity);
      await this.ingestDocument({
        title: manifest.name,
        body:  JSON.stringify(manifest),
        format: 'json',
        metadata: { source: 'skill_manifest', entityId: manifest.id, capability: manifest.capabilities?.[0] },
      });
      return entity;
    },
  };
}
