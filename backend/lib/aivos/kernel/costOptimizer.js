export function createCostOptimizer() {
  return {
    estimate({ prompt }) {
      const tokens = typeof prompt === 'string' ? prompt.length / 4 : 128;
      const estimated_cost = Math.max(0.0001, tokens * 0.00001);
      return { tokens, estimated_cost };
    },
  };
}
