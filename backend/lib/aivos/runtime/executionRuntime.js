export function createExecutionRuntime({ executionGraph, approvalGate, pipelineExecutor, pipelineTemplate }) {
  return {
    async run({ jobId, plan, traceId }) {
      let result;
      if (pipelineExecutor && pipelineTemplate) {
        result = await pipelineExecutor.executePlan({ runtimeJobId: jobId, plan: plan || pipelineTemplate, traceId });
      } else {
        result = await executionGraph.executePlan({ jobId, plan, traceId });
      }
      await approvalGate.moveToPreview(jobId, `preview://${jobId}`);
      return result;
    },
  };
}
