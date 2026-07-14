/**
 * Job chat proxy — authorization unit tests (no HTTP / Firestore).
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { assertUserMayPostJobChat } from '../lib/jobChatMessagesRoute.js';

function seqPool(rowsSequences) {
  let idx = 0;
  return {
    async query() {
      const rows = rowsSequences[idx++] ?? [];
      return { rows };
    },
  };
}

describe('assertUserMayPostJobChat', () => {
  test('allows employer when jobs.created_by matches firebase_uid', async () => {
    const pool = seqPool([
      [{ id: 'uuid-employer', firebase_uid: 'fb-111' }],
      [
        {
          created_by: 'fb-111',
          accepted_by: null,
          client_id: null,
        },
      ],
    ]);
    const r = await assertUserMayPostJobChat(pool, 'job-regular', 'fb-111');
    assert.equal(r.ok, true);
  });

  test('allows provider when accepted_by matches user uuid', async () => {
    const pool = seqPool([
      [{ id: 'uuid-worker', firebase_uid: '' }],
      [
        {
          created_by: 'other',
          accepted_by: 'uuid-worker',
          client_id: null,
        },
      ],
    ]);
    const r = await assertUserMayPostJobChat(pool, 'job-2', 'uuid-worker');
    assert.equal(r.ok, true);
  });

  test('allows advance_jobs employer_id', async () => {
    const pool = seqPool([
      [{ id: 'emp-uuid', firebase_uid: '' }],
      [],
      [{ employer_id: 'emp-uuid', hired_user_id: null }],
    ]);
    const r = await assertUserMayPostJobChat(
      pool,
      '550e8400-e29b-41d4-a716-446655440000',
      'emp-uuid',
    );
    assert.equal(r.ok, true);
  });

  test('allows advance_jobs hired_user_id', async () => {
    const pool = seqPool([
      [{ id: 'talent-uuid', firebase_uid: '' }],
      [],
      [{ employer_id: 'other', hired_user_id: 'talent-uuid' }],
    ]);
    const r = await assertUserMayPostJobChat(
      pool,
      '550e8400-e29b-41d4-a716-446655440001',
      'talent-uuid',
    );
    assert.equal(r.ok, true);
  });

  test('forbids unrelated user', async () => {
    const pool = seqPool([
      [{ id: 'u1', firebase_uid: '' }],
      [],
      [{ employer_id: 'e99', hired_user_id: null }],
    ]);
    const r = await assertUserMayPostJobChat(pool, 'adv-1', 'u1');
    assert.equal(r.ok, false);
    assert.equal(r.status, 403);
    assert.equal(r.code, 'JOB_CHAT_FORBIDDEN');
  });
});
