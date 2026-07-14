import { isQaEnabled, QA_PHASE } from './config.js';
import { createLayerProbe } from './layerProbe.js';
import { createRouteCatalog } from './routeCatalog.js';
import { createFeedbackLoopProbe } from './feedbackLoopProbe.js';

export function createQaEngine({ runtime } = {}) {
  if (!isQaEnabled()) {
    return {
      enabled: false,
      probeLayers:    () => ({ ok: false, reason: 'qa_disabled' }),
      probeFeedback:  () => ({ closed: false, reason: 'qa_disabled' }),
      listRoutes:     () => [],
    };
  }

  const layerProbe   = createLayerProbe({ runtime });
  const routeCatalog = createRouteCatalog();
  const feedbackProbe = createFeedbackLoopProbe({ runtime });

  return {
    enabled: true,
    phase:   QA_PHASE,
    probeLayers:   () => layerProbe.probe(),
    probeFeedback: () => feedbackProbe.probe(),
    listRoutes:    () => routeCatalog.list(),
    routeCount:    () => routeCatalog.count(),
    health() {
      const layers   = layerProbe.probe();
      const feedback = feedbackProbe.probe();
      return {
        ok:       layers.ok && feedback.closed,
        phase:    QA_PHASE,
        layers,
        feedback,
        routes:   routeCatalog.count(),
        at:       new Date().toISOString(),
      };
    },
  };
}

export { isQaEnabled, QA_PHASE } from './config.js';
