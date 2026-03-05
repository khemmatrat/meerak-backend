/**
 * ConflictValidator — Collision Guard Engine
 * Cross-check time slots in jobs, advance_jobs, and bookings.
 * Returns true if conflict detected (overlapping).
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

  // 1. Jobs (Match/Board) — provider_id or accepted_by, start_date, end_date
  const jobsRes = await pool.query(
    `SELECT id, start_date, end_date FROM jobs
     WHERE (provider_id::text = $1 OR accepted_by::text = $1) AND status IN ('accepted', 'in_progress', 'completed')
       AND start_date IS NOT NULL AND end_date IS NOT NULL
       ${excludeJobId ? 'AND id::text != $2' : ''}`,
    excludeJobId ? [userId, excludeJobId] : [userId]
  );
  for (const r of jobsRes.rows || []) {
    const start = r.start_date ? new Date(r.start_date) : null;
    const end = r.end_date ? new Date(r.end_date) : null;
    if (timeRangesOverlap(newStart, newEnd, start, end)) {
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
