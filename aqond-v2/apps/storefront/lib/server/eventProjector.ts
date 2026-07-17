import {
  listPendingOutbox,
  markOutboxDone,
  markOutboxProcessing,
  moveOutboxToDlq,
} from '@/lib/server/eventOutbox';

const MAX_ATTEMPTS = Number(process.env.EVENT_OUTBOX_MAX_ATTEMPTS || 5);

/** Idempotent projector — replays outbox entries (S14-S17). */
export async function processOutboxBatch(limit = 20) {
  const pending = await listPendingOutbox(limit);
  const results: Array<{ id: string; ok: boolean; error?: string }> = [];

  for (const entry of pending) {
    await markOutboxProcessing(entry.id);
    try {
      // Projection side-effect hook — extend with PG writers / notify fan-out.
      await markOutboxDone(entry.id);
      results.push({ id: entry.id, ok: true });
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'project_failed';
      if (entry.attempts >= MAX_ATTEMPTS) {
        await moveOutboxToDlq(entry.id, msg);
      }
      results.push({ id: entry.id, ok: false, error: msg });
    }
  }

  return { processed: results.length, results };
}

export async function replayOutbox(limit = 50) {
  return processOutboxBatch(limit);
}
