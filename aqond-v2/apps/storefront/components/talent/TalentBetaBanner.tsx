'use client';

import {
  isTalentOsBeta,
  isTalentOsEnabled,
  TALENT_GOVERNANCE_COPY,
  TALENT_RELEASE_VERSION,
} from '@/lib/talent/talentReleaseGovernance';

export function TalentBetaBanner() {
  if (!isTalentOsEnabled() || !isTalentOsBeta()) return null;

  return (
    <div className="tt-talent-governance-banner tt-talent-governance-banner--beta" role="status">
      <span aria-hidden>🧪</span>
      <p>
        {TALENT_GOVERNANCE_COPY.betaBanner}
        <small className="tt-talent-governance-version"> · {TALENT_RELEASE_VERSION}</small>
      </p>
    </div>
  );
}
