import { createPipelineExecutor } from './executionGraph.js';
import { getVideoPipelineTemplate } from './templates/videoPipelineV1.js';
import { createMediaEngine } from './mediaEngine.js';
import { createRenderEngine } from '../render/index.js';
import { createPublishEngine } from '../publish/index.js';

export function createPipeline(deps = {}) {
  const template = getVideoPipelineTemplate();
  const mediaEngine = deps.mediaEngine || createMediaEngine();
  const renderEngine = deps.renderEngine || createRenderEngine(deps.renderDeps || {});
  const publishEngine = deps.publishEngine || createPublishEngine(deps.publishDeps || {});
  const executor = createPipelineExecutor({
    store: deps.store,
    checkpointManager: deps.checkpointManager,
    events: deps.events,
    observability: deps.observability,
    mediaEngine,
    renderEngine,
    publishEngine,
  });
  return {
    template,
    executor,
    mediaEngine,
    renderEngine,
    publishEngine,
  };
}

export { getVideoPipelineTemplate } from './templates/videoPipelineV1.js';
export { createPipelineExecutor } from './executionGraph.js';
