import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeFunnelEventType,
  COURSE_FUNNEL_EVENTS,
} from '../lib/courseFunnelAnalytics.js';

test('normalizeFunnelEventType accepts known funnel steps', () => {
  for (const t of COURSE_FUNNEL_EVENTS) {
    assert.equal(normalizeFunnelEventType(t), t);
  }
});

test('normalizeFunnelEventType rejects unknown events', () => {
  assert.equal(normalizeFunnelEventType('page_view'), null);
  assert.equal(normalizeFunnelEventType(''), null);
});
