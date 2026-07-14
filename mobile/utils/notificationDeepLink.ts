/** Shared deep-link resolver for `/api/notifications/latest` rows and merged UI notifications. */

export function getJobIdFromNotificationPayload(payload: {
  jobId?: string | null;
  notificationType?: string;
  data?: Record<string, unknown> | null;
}): string | null {
  if (payload.jobId) return String(payload.jobId).trim() || null;
  const raw = payload.data?.job_id;
  if (raw != null && String(raw).trim()) return String(raw).trim();
  return null;
}

export function shouldOpenJobChatForNotification(payload: {
  notificationType?: string;
  data?: Record<string, unknown> | null;
  source?: string;
}): boolean {
  if (String(payload.notificationType || "") === "job_progress") return true;
  if (payload.data?.open_chat === true) return true;
  return false;
}

export function getNotificationJobNavigatePath(payload: {
  source?: string;
  jobId?: string | null;
  notificationType?: string;
  data?: Record<string, unknown> | null;
}): string | null {
  const jid = getJobIdFromNotificationPayload(payload);
  if (!jid) return null;
  return shouldOpenJobChatForNotification(payload) ? `/jobs/${jid}#chat` : `/jobs/${jid}`;
}
