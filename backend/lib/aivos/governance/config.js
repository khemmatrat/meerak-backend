export function isGovernanceEnabled() {
  return (
    process.env.AIVOS_GOVERNANCE_ENABLED === '1' ||
    process.env.AIVOS_GOVERNANCE_ENABLED === 'true'
  );
}

export const MAX_SNAPSHOTS_PER_ENTITY = 10;
