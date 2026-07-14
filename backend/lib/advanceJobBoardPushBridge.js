/**
 * Push notification bridge — ใช้ board-badges logic เดียวกับ deep link ฝั่ง mobile
 * Event → enqueue push job → client เปิด deep link เดียวกับ card badge
 */

/** ชนิด badge / deep link ที่สอดคล้อง mobile JobBoard */
export const ADVANCE_JOB_PUSH_KINDS = {
  UNREAD_CHAT: 'unread_chat',
  PENDING_ESCROW: 'pending_escrow',
  PENDING_REVIEW: 'pending_review',
  ESCROW_HELD: 'escrow_held',
  WORK_SUBMITTED: 'work_submitted',
  REVISION_REQUESTED: 'revision_requested',
};

export function scheduleAdvanceJobPushNotification({
  recipientUserId,
  eventType,
  deepLink,
  title,
  body,
}) {
  if (!recipientUserId || !eventType) return;
  setImmediate(async () => {
    try {
      const payload = {
        user_id: String(recipientUserId),
        type: `advance_job_${eventType}`,
        deep_link: deepLink || null,
        title: title || 'AQOND Job Board',
        body: body || 'มีรายการที่ต้องดำเนินการ',
        source: 'board_badges',
      };
      if (typeof globalThis.__aqPushQueue?.add === 'function') {
        await globalThis.__aqPushQueue.add('push-notifications', payload, {
          removeOnComplete: 100,
          removeOnFail: 50,
        });
      } else if (process.env.NODE_ENV !== 'production') {
        console.debug('[advanceJobPushBridge] queue not wired', payload);
      }
    } catch (_) {
      /* fail-open — badge counts remain source of truth in app */
    }
  });
}

/**
 * Deep link มาตรฐานตามประเภท badge (สอดคล้อง mobile JobBoard card badges)
 */
export function advanceJobPushDeepLink({ role, jobId, talentId, kind }) {
  const id = String(jobId || '').trim();
  if (!id) return '/job-board';
  if (kind === ADVANCE_JOB_PUSH_KINDS.UNREAD_CHAT) {
    if (role === 'employer') return `/job-board/${id}/manage?tab=chat`;
    if (talentId) return `/job-board/${id}/chat/${talentId}`;
    return `/job-board/${id}/manage?tab=chat`;
  }
  if (kind === ADVANCE_JOB_PUSH_KINDS.PENDING_REVIEW) {
    return `/job-board/${id}/manage?tab=review`;
  }
  if (
    kind === ADVANCE_JOB_PUSH_KINDS.PENDING_ESCROW ||
    kind === ADVANCE_JOB_PUSH_KINDS.ESCROW_HELD ||
    kind === ADVANCE_JOB_PUSH_KINDS.WORK_SUBMITTED ||
    kind === ADVANCE_JOB_PUSH_KINDS.REVISION_REQUESTED
  ) {
    return `/job-board/${id}/manage?tab=escrow`;
  }
  return `/job-board/${id}/manage`;
}

/**
 * ส่ง push payload พร้อม deep link ตาม kind — เรียกคู่กับ pushUserNotificationIfNotPeaceMode ใน server
 */
export function notifyAdvanceJobBoardEvent({
  recipientUserId,
  kind,
  role,
  jobId,
  talentId,
  title,
  body,
  eventType,
}) {
  if (!recipientUserId || !kind) return;
  scheduleAdvanceJobPushNotification({
    recipientUserId,
    eventType: eventType || kind,
    deepLink: advanceJobPushDeepLink({ role, jobId, talentId, kind }),
    title,
    body,
  });
}
