/**
 * Client-side idempotency keys for course purchase retries.
 */
const STORAGE_PREFIX = 'aqond_course_purchase_idem:';

export function getOrCreateCoursePurchaseIdempotencyKey(courseId: string) {
  const key = `${STORAGE_PREFIX}${courseId}`;
  try {
    const existing = sessionStorage.getItem(key);
    if (existing) return existing;
    const created = crypto.randomUUID();
    sessionStorage.setItem(key, created);
    return created;
  } catch {
    return crypto.randomUUID();
  }
}

export function clearCoursePurchaseIdempotencyKey(courseId: string) {
  try {
    sessionStorage.removeItem(`${STORAGE_PREFIX}${courseId}`);
  } catch {
    /* ignore */
  }
}
