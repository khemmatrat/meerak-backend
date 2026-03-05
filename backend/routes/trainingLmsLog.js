/**
 * Log training admin actions to system_event_log
 */
export async function logTrainingEvent(pool, actorId, action, entityType, entityId, stateBefore, stateAfter) {
  if (!pool) return;
  try {
    await pool.query(
      `INSERT INTO system_event_log (actor_type, actor_id, action, entity_type, entity_id, state_before, state_after)
       VALUES ('admin', $1, $2, $3, $4, $5, $6)`,
      [
        actorId,
        action,
        entityType,
        entityId,
        stateBefore ? JSON.stringify(stateBefore) : null,
        stateAfter ? JSON.stringify(stateAfter) : null,
      ]
    );
  } catch (e) {
    console.warn('logTrainingEvent failed:', e?.message);
  }
}
