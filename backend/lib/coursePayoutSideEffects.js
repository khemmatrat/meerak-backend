/**
 * Post-commit side effects after course payout release (fiscal draft + blocked notify).
 */
import { tryGenerateCoursePayoutFiscalDraft } from './courseFiscalService.js';
import { notifyInstructorPayoutBlockedBatch } from './coursePayoutNotify.js';

export async function runCoursePayoutReleaseSideEffects(pool, notifyUser, result) {
  for (const row of result?.released || []) {
    if (row.ledgerId && !row.idempotent) {
      tryGenerateCoursePayoutFiscalDraft(pool, { ledgerId: row.ledgerId }).catch((e) => {
        console.warn('[coursePayoutSideEffects] fiscal:', e?.message);
      });
    }
  }
  await notifyInstructorPayoutBlockedBatch(pool, notifyUser, result?.blocked || []);
}
