/**
 * ConflictValidator — Collision Guard Engine
 * Cross-check time slots in jobs, advance_jobs, and bookings.
 * Jobs: ใช้ start_date/end_date ถ้ามี; ไม่มีใช้ datetime + duration_hours (ตรงกับงานส่วนใหญ่ในระบบ)
 */

/**
 * @param {Date} start1
 * @param {Date} end1
 * @param {Date} start2
 * @param {Date} end2
 * @returns {boolean} true if overlap
 */
function timeRangesOverlap(start1, end1, start2, end2) {
  if (!start1 || !end1 || !start2 || !end2) return false;
  const s1 = new Date(start1).getTime();
  const e1 = new Date(end1).getTime();
  const s2 = new Date(start2).getTime();
  const e2 = new Date(end2).getTime();
  return s1 < e2 && s2 < e1;
}

const ACTIVE_JOB_STATUSES = ['accepted', 'in_progress', 'waiting_for_approval', 'waiting_for_payment'];

/**
 * คำนวณช่วงเวลาของงานจากแถว jobs (รองรับทั้ง schema ที่มีแค่ datetime)
 * @param {object} jobRow
 * @returns {{ start: Date, end: Date } | null}
 */
export function resolveJobTimeRange(jobRow) {
  if (!jobRow) return null;
  if (jobRow.start_date && jobRow.end_date) {
    const s = new Date(jobRow.start_date);
    const e = new Date(jobRow.end_date);
    if (!isNaN(s.getTime()) && !isNaN(e.getTime()) && e > s) return { start: s, end: e };
  }
  const d = jobRow.datetime || jobRow.posted_at || jobRow.created_at;
  if (!d) return null;
  const start = new Date(d);
  if (isNaN(start.getTime())) return null;
  const dur = parseFloat(jobRow.duration_hours);
  const hours = Number.isFinite(dur) && dur > 0 ? dur : 2;
  return { start, end: new Date(start.getTime() + hours * 3600000) };
}

/**
 * Slot จาก body ของ POST /api/jobs/match (ยังไม่มี job ใน DB)
 * @param {{ job_datetime?: string, duration_hours?: number }} bodySlot
 */
export function resolveSlotFromMatchBody(jobRow, bodySlot) {
  const fromJob = resolveJobTimeRange(jobRow);
  if (fromJob) return fromJob;
  if (bodySlot?.job_datetime == null) return null;
  const start = new Date(bodySlot.job_datetime);
  if (isNaN(start.getTime())) return null;
  const dur = parseFloat(bodySlot.duration_hours);
  const hours = Number.isFinite(dur) && dur > 0 ? dur : 2;
  return { start, end: new Date(start.getTime() + hours * 3600000) };
}

/**
 * provider id ที่มีงานชนกับช่วง [newStart, newEnd] (สำหรับกรองแบบ batch)
 * @param {object} pool
 * @param {string[]} providerIds
 * @param {{ start: Date, end: Date }} newSlot
 * @param {string|null} excludeJobId
 * @returns {Promise<Set<string>>}
 */
export async function loadProviderIdsWithScheduleConflict(pool, providerIds, newSlot, excludeJobId = null) {
  const busy = new Set();
  if (!providerIds?.length || !newSlot?.start || !newSlot?.end) return busy;
  const newStart = new Date(newSlot.start);
  const newEnd = new Date(newSlot.end);
  if (isNaN(newStart.getTime()) || isNaN(newEnd.getTime())) return busy;

  try {
    const r = await pool.query(
      `SELECT DISTINCT accepted_by::text AS pid
       FROM jobs
       WHERE accepted_by::text = ANY($1::text[])
         AND LOWER(TRIM(COALESCE(status, ''))) = ANY($2::text[])
         AND ($3::text IS NULL OR id::text IS DISTINCT FROM $3::text)
         AND COALESCE(start_date, datetime, posted_at, created_at) IS NOT NULL
         AND COALESCE(start_date, datetime, posted_at, created_at) < $5::timestamptz
         AND COALESCE(start_date, datetime, posted_at, created_at)
             + COALESCE(duration_hours, 2) * interval '1 hour' > $4::timestamptz`,
      [providerIds, ACTIVE_JOB_STATUSES, excludeJobId || null, newStart.toISOString(), newEnd.toISOString()]
    );
    for (const row of r.rows || []) {
      if (row.pid) busy.add(String(row.pid));
    }
  } catch (e) {
    console.warn('[loadProviderIdsWithScheduleConflict]', e?.message);
  }
  return busy;
}

/**
 * @param {object} pool - pg Pool
 * @param {string} userId - provider/talent user id
 * @param {{ start: Date|string, end: Date|string }} newSlot
 * @param {string} excludeJobId - optional job id to exclude (e.g. current job)
 * @param {string} excludeBookingId - optional booking id to exclude
 * @returns {Promise<{ hasConflict: boolean, conflicting: Array<{ type: string, id: string }> }>}
 */
async function checkProviderConflict(pool, userId, newSlot, excludeJobId = null, excludeBookingId = null) {
  const conflicting = [];
  const newStart = new Date(newSlot.start);
  const newEnd = new Date(newSlot.end);

  // 1. Jobs — datetime + duration หรือ start/end
  const jobsRes = await pool.query(
    `SELECT id, datetime, duration_hours, start_date, end_date, posted_at, created_at, status
     FROM jobs
     WHERE (provider_id::text = $1 OR accepted_by::text = $1)
       AND LOWER(TRIM(COALESCE(status, ''))) = ANY($2::text[])
       ${excludeJobId ? 'AND id::text != $3' : ''}`,
    excludeJobId ? [userId, ACTIVE_JOB_STATUSES, excludeJobId] : [userId, ACTIVE_JOB_STATUSES]
  );
  for (const r of jobsRes.rows || []) {
    const range = resolveJobTimeRange(r);
    if (!range) continue;
    if (timeRangesOverlap(newStart, newEnd, range.start, range.end)) {
      conflicting.push({ type: 'job', id: r.id });
    }
  }

  // 2. Advance jobs — hired_user_id, use duration_days from hired_at
  const advRes = await pool.query(
    `SELECT id, hired_at, duration_days FROM advance_jobs
     WHERE hired_user_id::text = $1 AND status IN ('in_progress', 'pending')
       ${excludeJobId ? 'AND id::text != $2' : ''}`,
    excludeJobId ? [userId, excludeJobId] : [userId]
  );
  for (const r of advRes.rows || []) {
    const hiredAt = r.hired_at ? new Date(r.hired_at) : null;
    const days = parseInt(r.duration_days, 10) || 1;
    if (hiredAt) {
      const end = new Date(hiredAt);
      end.setDate(end.getDate() + days);
      if (timeRangesOverlap(newStart, newEnd, hiredAt, end)) {
        conflicting.push({ type: 'advance_job', id: r.id });
      }
    }
  }

  // 3. Bookings — talent_id, via availability_slots
  const bookRes = await pool.query(
    `SELECT b.id, s.start_time, s.end_time FROM bookings b
     JOIN availability_slots s ON s.id = b.slot_id
     WHERE b.talent_id::text = $1 AND b.status IN ('pending', 'confirmed')
       ${excludeBookingId ? 'AND b.id::text != $2' : ''}`,
    excludeBookingId ? [userId, excludeBookingId] : [userId]
  );
  for (const r of bookRes.rows || []) {
    const start = r.start_time ? new Date(r.start_time) : null;
    const end = r.end_time ? new Date(r.end_time) : null;
    if (timeRangesOverlap(newStart, newEnd, start, end)) {
      conflicting.push({ type: 'booking', id: r.id });
    }
  }

  return { hasConflict: conflicting.length > 0, conflicting };
}

export { timeRangesOverlap, checkProviderConflict };
