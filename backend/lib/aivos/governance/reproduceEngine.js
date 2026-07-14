import { sha256Artifact } from './versioning.js';

export function createReproduceEngine({ store }) {
  return {
    async reproduce(jobId) {
      const job = await store.getJob(jobId);
      if (!job) return null;
      const plan = await store.getPlanByJobId(jobId);
      const decisions = await store.listPolicyDecisionsByJob(jobId);
      const events = await store.listEventsByCorrelation(jobId);

      const artifacts = { job, plan, policyDecisions: decisions, events };
      const hashes = {
        job:              sha256Artifact(job),
        plan:             sha256Artifact(plan),
        policyDecisions:  sha256Artifact(decisions),
        events:           sha256Artifact(events),
      };

      return { jobId, artifacts, hashes, reproducedAt: new Date().toISOString() };
    },

    async diff(jobId, baseline) {
      const current = await this.reproduce(jobId);
      if (!current || !baseline?.hashes) {
        return { jobId, diff: {}, match: false };
      }
      const diff = {};
      for (const key of Object.keys(current.hashes)) {
        diff[key] = {
          match: current.hashes[key] === baseline.hashes[key],
          current: current.hashes[key],
          baseline: baseline.hashes[key],
        };
      }
      const match = Object.values(diff).every((d) => d.match);
      return { jobId, diff, match, current, baseline };
    },
  };
}
