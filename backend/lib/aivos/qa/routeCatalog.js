export const PUBLIC_ROUTE_CATALOG = Object.freeze([
  { method: 'GET',  path: '/api/aivos/runtime/health' },
  { method: 'GET',  path: '/api/aivos/production/readiness' },
  { method: 'GET',  path: '/api/aivos/production/openapi.json' },
  { method: 'GET',  path: '/api/aivos/production/checklist' },
  { method: 'GET',  path: '/api/aivos/marketplace/plugins' },
  { method: 'GET',  path: '/api/aivos/billing/status' },
  { method: 'GET',  path: '/api/aivos/governance/jobs/:id/reproduce' },
  { method: 'GET',  path: '/api/aivos/qa/health' },
  { method: 'GET',  path: '/api/aivos/qa/layers' },
  { method: 'POST', path: '/api/aivos/runtime/jobs' },
]);

export function createRouteCatalog() {
  return {
    list: () => PUBLIC_ROUTE_CATALOG.map((r) => ({ ...r })),
    count: () => PUBLIC_ROUTE_CATALOG.length,
  };
}
