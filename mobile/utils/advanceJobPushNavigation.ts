/** Resolve FCM data payload → React Router path (HashRouter). */

export function resolvePushNotificationPath(
  data?: Record<string, unknown> | null,
): string | null {
  if (!data) return null;
  const raw = data.deep_link ?? data.route ?? data.path;
  if (typeof raw !== "string" || !raw.trim()) return null;

  let path = raw.trim();
  if (path.startsWith("aqond://")) {
    try {
      const u = new URL(path);
      path = `${u.pathname}${u.search}${u.hash}`;
    } catch {
      return null;
    }
  }
  if (path.startsWith("#/")) path = path.slice(1);
  if (path.startsWith("#")) path = path.slice(1);
  if (!path.startsWith("/")) path = `/${path}`;

  if (path.startsWith("/jobs/")) {
    const jobId = path.split("/")[2]?.split(/[?#]/)[0];
    if (jobId && path.includes("#chat")) {
      return `/job-board/${jobId}/manage?tab=chat`;
    }
  }

  return path;
}
