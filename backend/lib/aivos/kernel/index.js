import { createKernelStore } from './kernelStore.js';
import { createModelRouter } from './modelRouter.js';
import { createMemoryApi } from './memoryApi.js';
import { createQualityEngine } from './qualityEngine.js';
import { createCostOptimizer } from './costOptimizer.js';
import { assertKernelEnabled } from './config.js';

export function createKernel(deps = {}) {
  assertKernelEnabled();
  const store = deps.store || createKernelStore(deps.seed || {});
  const costOptimizer = createCostOptimizer();
  const modelRouter = createModelRouter({ costOptimizer });
  const memoryApi = createMemoryApi({ store });
  const qualityEngine = createQualityEngine();

  return {
    store,
    modelRouter,
    memory: memoryApi,
    quality: qualityEngine,
    costOptimizer,
  };
}

export default createKernel;
