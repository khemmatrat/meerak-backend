export function createKnowledgeGraph({ store, relationshipEngine } = {}) {
  return {
    addNode(entity) {
      return store.insertEntity(entity);
    },

    link(fromId, toId, relation = 'related_to') {
      return relationshipEngine.addRelationship({ fromId, toId, type: relation });
    },

    getNode(id) {
      return store.getEntity(id);
    },

    neighbors(id, { depth = 1 } = {}) {
      const visited = new Set([id]);
      let frontier = [id];
      const edges = [];
      for (let d = 0; d < depth; d += 1) {
        const next = [];
        for (const nodeId of frontier) {
          const rels = relationshipEngine.listForEntity(nodeId);
          for (const r of rels) {
            edges.push(r);
            const other = r.from_id === nodeId ? r.to_id : r.from_id;
            if (!visited.has(other)) {
              visited.add(other);
              next.push(other);
            }
          }
        }
        frontier = next;
      }
      const nodes = [...visited].map((nid) => store.getEntity(nid)).filter(Boolean);
      return { nodes, edges };
    },

    hierarchy(rootId) {
      const root = store.getEntity(rootId);
      if (!root) return null;
      const children = relationshipEngine.listChildren(rootId);
      return {
        ...root,
        children: children.map((c) => {
          const entity = store.getEntity(c.to_id);
          return entity ? { ...entity, relation: c.type } : null;
        }).filter(Boolean),
      };
    },

    crossReferences(entityId) {
      const entity = store.getEntity(entityId);
      if (!entity) return [];
      const refs = relationshipEngine.listForEntity(entityId).filter((r) => r.type === 'cross_ref');
      return refs.map((r) => {
        const otherId = r.from_id === entityId ? r.to_id : r.from_id;
        return { ...r, entity: store.getEntity(otherId) };
      });
    },

    snapshot() {
      return {
        entities: store.listEntities(),
        relationships: relationshipEngine.listAll(),
      };
    },
  };
}
