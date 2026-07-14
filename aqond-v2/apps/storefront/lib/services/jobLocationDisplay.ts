import type { MatchJob } from './matchJobTypes';

export function formatJobPrimaryAddress(job: Pick<MatchJob, 'title' | 'location'>): string {
  const loc = job.location;
  if (loc?.fullAddress?.trim()) return loc.fullAddress.trim();
  const parts = [loc?.area, loc?.district, loc?.province].filter(
    (x): x is string => !!x && String(x).trim().length > 0,
  );
  if (parts.length) return parts.join(' ');
  if (job.title?.trim()) return job.title.trim();
  return '';
}
