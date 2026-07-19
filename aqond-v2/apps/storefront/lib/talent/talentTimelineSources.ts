import { loadTalentSearchRaw } from '@/lib/talent/talentSearchSources';

/** Timeline reuses search-wide read limits — same parallel fetches, no new API */
export const loadTalentTimelineRaw = loadTalentSearchRaw;
