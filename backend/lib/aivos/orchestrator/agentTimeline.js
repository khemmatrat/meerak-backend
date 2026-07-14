export function createAgentTimeline({ observability } = {}) {
  const timelines = new Map();

  return {
    start(runId, meta = {}) {
      timelines.set(runId, {
        runId,
        startedAt: new Date().toISOString(),
        endedAt:   null,
        steps:     [],
        meta,
      });
      return timelines.get(runId);
    },

    recordStep(runId, step) {
      const tl = timelines.get(runId);
      if (!tl) return null;
      const entry = {
        ...step,
        at: step.at || new Date().toISOString(),
      };
      tl.steps.push(entry);
      if (observability?.recordNodeStart && step.nodeId) {
        observability.recordNodeStart({
          jobId:  runId,
          nodeId: step.nodeId,
          startedAt: entry.at,
        }).catch(() => {});
      }
      return entry;
    },

    finish(runId, status = 'completed') {
      const tl = timelines.get(runId);
      if (!tl) return null;
      tl.endedAt = new Date().toISOString();
      tl.status = status;
      return { ...tl, steps: tl.steps.map((s) => ({ ...s })) };
    },

    getTimeline(runId) {
      const tl = timelines.get(runId);
      return tl ? { ...tl, steps: tl.steps.map((s) => ({ ...s })) } : null;
    },

    listTimelines() {
      return [...timelines.values()].map((tl) => ({
        runId:     tl.runId,
        startedAt: tl.startedAt,
        endedAt:   tl.endedAt,
        status:    tl.status,
        stepCount: tl.steps.length,
      }));
    },
  };
}
