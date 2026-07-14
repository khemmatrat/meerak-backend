import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  advanceJobPushDeepLink,
  ADVANCE_JOB_PUSH_KINDS,
} from '../lib/advanceJobBoardPushBridge.js';

describe('advanceJobPushDeepLink', () => {
  it('returns job board root when job id missing', () => {
    assert.equal(advanceJobPushDeepLink({ kind: ADVANCE_JOB_PUSH_KINDS.PENDING_ESCROW }), '/job-board');
  });

  it('routes pending escrow to escrow tab', () => {
    assert.equal(
      advanceJobPushDeepLink({
        jobId: 'abc-123',
        kind: ADVANCE_JOB_PUSH_KINDS.PENDING_ESCROW,
      }),
      '/job-board/abc-123/manage?tab=escrow',
    );
  });

  it('routes pending review to review tab', () => {
    assert.equal(
      advanceJobPushDeepLink({
        jobId: 'abc-123',
        kind: ADVANCE_JOB_PUSH_KINDS.PENDING_REVIEW,
      }),
      '/job-board/abc-123/manage?tab=review',
    );
  });

  it('routes employer unread chat to manage chat tab', () => {
    assert.equal(
      advanceJobPushDeepLink({
        role: 'employer',
        jobId: 'j1',
        kind: ADVANCE_JOB_PUSH_KINDS.UNREAD_CHAT,
      }),
      '/job-board/j1/manage?tab=chat',
    );
  });

  it('routes talent unread chat to thread', () => {
    assert.equal(
      advanceJobPushDeepLink({
        role: 'talent',
        jobId: 'j1',
        talentId: 't99',
        kind: ADVANCE_JOB_PUSH_KINDS.UNREAD_CHAT,
      }),
      '/job-board/j1/chat/t99',
    );
  });

  it('routes work submitted to escrow tab for employer review', () => {
    assert.equal(
      advanceJobPushDeepLink({
        jobId: 'j1',
        kind: ADVANCE_JOB_PUSH_KINDS.WORK_SUBMITTED,
      }),
      '/job-board/j1/manage?tab=escrow',
    );
  });
});
