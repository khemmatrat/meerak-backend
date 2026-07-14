import { api } from "../services/api";

const SESSION_KEY = "aqond_course_funnel_session";

export type CourseFunnelEventType =
  | "course_impression"
  | "course_detail_view"
  | "course_preview_play"
  | "course_purchase_intent"
  | "course_purchase_completed"
  | "course_lesson_completed"
  | "course_completed"
  | "course_review_submitted";

function getSessionId() {
  try {
    let id = sessionStorage.getItem(SESSION_KEY);
    if (!id) {
      id = `cfs_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
      sessionStorage.setItem(SESSION_KEY, id);
    }
    return id;
  } catch {
    return `cfs_${Date.now()}`;
  }
}

export async function trackCourseFunnel(
  courseId: string,
  eventType: CourseFunnelEventType,
  metadata: Record<string, unknown> = {},
) {
  if (!courseId || !eventType) return;
  try {
    await api.post(
      "/courses/analytics/events",
      {
        courseId,
        eventType,
        sessionId: getSessionId(),
        metadata,
      },
      { headers: { "X-Course-Session": getSessionId() } },
    );
  } catch {
    /* non-blocking analytics */
  }
}

export async function trackCourseFunnelBatch(
  events: Array<{ courseId: string; eventType: CourseFunnelEventType; metadata?: Record<string, unknown> }>,
) {
  if (!events.length) return;
  const sessionId = getSessionId();
  try {
    await api.post(
      "/courses/analytics/events",
      {
        events: events.map((e) => ({
          courseId: e.courseId,
          eventType: e.eventType,
          sessionId,
          metadata: e.metadata || {},
        })),
      },
      { headers: { "X-Course-Session": sessionId } },
    );
  } catch {
    /* non-blocking */
  }
}
