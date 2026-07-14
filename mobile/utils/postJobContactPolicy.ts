/**
 * สอดคล้อง backend normalizeJobForApi — ซ่อนเบอร์หลังหมดช่วงโทร (Firestore / ข้อมูลที่ไม่ผ่าน API)
 */
const DEFAULT_GRACE_HOURS = 24;

function graceMs(): number {
  const h = Number(
    import.meta.env.VITE_POST_JOB_PHONE_GRACE_HOURS ?? DEFAULT_GRACE_HOURS
  );
  const hours = Number.isFinite(h) && h > 0 ? h : DEFAULT_GRACE_HOURS;
  return hours * 3600000;
}

function completionTimestamp(job: {
  status?: string;
  completed_at?: string;
  updated_at?: string;
}): number | null {
  const st = String(job.status || "").toLowerCase();
  if (st !== "completed") return null;
  if (job.completed_at) {
    const t = new Date(job.completed_at).getTime();
    if (!isNaN(t)) return t;
  }
  if (job.updated_at) {
    const t = new Date(job.updated_at).getTime();
    if (!isNaN(t)) return t;
  }
  return null;
}

export function applyPostJobContactPolicy<T extends Record<string, unknown>>(
  job: T
): T {
  const out = { ...job } as Record<string, unknown>;
  const st = String(out.status || "").toLowerCase();
  const g = graceMs();

  if (st === "cancelled" || st === "expired") {
    out.accepted_by_phone = null;
    out.created_by_phone = null;
    out.contact_phone_visible_until = null;
    return out as T;
  }

  const ct = completionTimestamp(out as { status?: string; completed_at?: string; updated_at?: string });
  if (st === "completed" && ct != null) {
    const until = ct + g;
    out.contact_phone_visible_until = new Date(until).toISOString();
    if (Date.now() > until) {
      out.accepted_by_phone = null;
      out.created_by_phone = null;
    }
  } else {
    out.contact_phone_visible_until = out.contact_phone_visible_until ?? null;
  }

  return out as T;
}
