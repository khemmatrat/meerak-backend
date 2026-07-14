import { randomUUID } from 'crypto';

export function createModelRouter({ costOptimizer }) {
  return {
    async infer({ taskType, decision, compiledPrompt, traceId }) {
      if (!decision || !decision.modelSlot) {
        const err = new Error('policy_decision_required');
        err.code = 'POLICY_DECISION_REQUIRED';
        throw err;
      }
      if (!compiledPrompt) {
        const err = new Error('compiled_prompt_required');
        err.code = 'COMPILED_PROMPT_REQUIRED';
        throw err;
      }
      const promptText = Array.isArray(compiledPrompt?.messages)
        ? compiledPrompt.messages.map((m) => m.content || '').join('\n')
        : String(compiledPrompt || '');
      const cost = costOptimizer.estimate({ prompt: promptText });
      return {
        id: randomUUID(),
        model: decision.modelSlot,
        taskType,
        traceId: traceId || null,
        output: {
          text: '[stubbed kernel output]',
          metadata: { tokens: cost.tokens },
        },
        cost,
      };
    },
  };
}
