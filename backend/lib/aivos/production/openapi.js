/**
 * OpenAPI 3.0 spec generated from the public AI-OS Runtime SDK surface.
 * Phase 8 production artifact — no internal Kernel routes exposed.
 */
export function generateOpenApiSpec() {
  return {
    openapi: '3.0.3',
    info: {
      title:       'AQOND AI-OS Runtime API',
      version:     '1.0.0',
      description: 'Public Runtime SDK surface. Plugins and clients must use these routes only.',
    },
    servers: [{ url: '/api/aivos', description: 'AI-OS Runtime' }],
    paths: {
      '/runtime/health': {
        get: {
          summary:     'Runtime health check',
          operationId: 'getRuntimeHealth',
          responses:   { '200': { description: 'Health status' } },
        },
      },
      '/production/readiness': {
        get: {
          summary:     'Production readiness probe',
          operationId: 'getProductionReadiness',
          responses:   { '200': { description: 'Readiness check result' }, '503': { description: 'Not ready' } },
        },
      },
      '/production/openapi.json': {
        get: {
          summary:     'This OpenAPI spec',
          operationId: 'getOpenApiSpec',
          responses:   { '200': { description: 'OpenAPI 3.0 JSON' } },
        },
      },
      '/runtime/jobs': {
        post: {
          summary:     'Submit a runtime job',
          operationId: 'submitJob',
          requestBody: { required: true, content: { 'application/json': { schema: { type: 'object' } } } },
          responses:   { '201': { description: 'Job created' }, '400': { description: 'Validation error' } },
        },
      },
      '/runtime/jobs/{id}': {
        get: {
          summary:     'Get job status',
          operationId: 'getJob',
          parameters:  [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
          responses:   { '200': { description: 'Job record' }, '404': { description: 'Not found' } },
        },
      },
      '/runtime/jobs/{id}/trace': {
        get: {
          summary:     'Get OTel-aligned job trace spans',
          operationId: 'getJobTrace',
          parameters:  [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
          responses:   { '200': { description: 'Span tree' } },
        },
      },
      '/runtime/jobs/{id}/timeline': {
        get: {
          summary:     'Get job execution timeline',
          operationId: 'getJobTimeline',
          parameters:  [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
          responses:   { '200': { description: 'Timeline entries' } },
        },
      },
      '/runtime/jobs/{id}/cost': {
        get: {
          summary:     'Get job cost summary',
          operationId: 'getJobCost',
          parameters:  [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
          responses:   { '200': { description: 'Cost ledger summary' } },
        },
      },
      '/runtime/jobs/{id}/approve': {
        post: {
          summary:     'Approve job for publish',
          operationId: 'approveJob',
          parameters:  [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
          responses:   { '200': { description: 'Approval recorded' } },
        },
      },
      '/runtime/jobs/{id}/reject': {
        post: {
          summary:     'Reject job',
          operationId: 'rejectJob',
          parameters:  [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
          responses:   { '200': { description: 'Rejection recorded' } },
        },
      },
      '/runtime/jobs/{id}/events': {
        get: {
          summary:     'List ACP events for job',
          operationId: 'listJobEvents',
          parameters:  [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
          responses:   { '200': { description: 'Event list' } },
        },
      },
    },
  };
}
