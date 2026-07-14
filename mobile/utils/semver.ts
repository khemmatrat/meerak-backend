/** Compare semver-like strings (major.minor.patch). Non-numeric parts are truncated. */
export function compareSemver(a: string, b: string): number {
  const pa = String(a || "")
    .split(".")
    .map((x) => parseInt(x.replace(/\D/g, ""), 10) || 0);
  const pb = String(b || "")
    .split(".")
    .map((x) => parseInt(x.replace(/\D/g, ""), 10) || 0);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const da = pa[i] ?? 0;
    const db = pb[i] ?? 0;
    if (da > db) return 1;
    if (da < db) return -1;
  }
  return 0;
}

export function isBelowMinVersion(appVersion: string, minVersion: string): boolean {
  const min = String(minVersion || "").trim();
  if (!min) return false;
  const app = String(appVersion || "").trim();
  if (!app) return false;
  return compareSemver(app, min) < 0;
}
