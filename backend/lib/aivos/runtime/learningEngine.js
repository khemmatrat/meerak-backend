export function createLearningEngine() {
  return {
    async ingestPublishedJob() {
      return { accepted: false, reason: 'phase_6_scope' };
    },
  };
}
