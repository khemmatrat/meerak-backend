export function createQualityEngine() {
  const dimensions = [
    'visual_coherence',
    'narrative_clarity',
    'audio_clarity',
    'subtitle_accuracy',
    'brand_compliance',
    'duration_fit',
    'technical_quality',
    'content_safety',
    'engagement_hook',
  ];

  return {
    async score({ artifact, context = {} }) {
      const scores = Object.fromEntries(dimensions.map((d) => [d, 0.85]));
      const blocked = scores.content_safety < 0.5 || scores.technical_quality < 0.4;
      return {
        jobId: context.jobId || null,
        aggregate: 0.85,
        scores,
        blocked,
        retry_nodes: blocked ? ['quality'] : [],
      };
    },
  };
}
