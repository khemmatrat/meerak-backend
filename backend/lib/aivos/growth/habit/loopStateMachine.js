export const LOOP_PHASES = Object.freeze([
  'IDLE',
  'OPEN',
  'BRIEFING',
  'EXECUTING',
  'REWARDING',
  'LEARNING',
  'RECOMMENDING',
  'MISSIONING',
  'REVIEWING',
]);

const TRANSITIONS = Object.freeze({
  IDLE: ['OPEN'],
  OPEN: ['BRIEFING'],
  BRIEFING: ['MISSIONING', 'EXECUTING'],
  MISSIONING: ['EXECUTING', 'REVIEWING'],
  EXECUTING: ['REWARDING', 'REVIEWING'],
  REWARDING: ['RECOMMENDING', 'LEARNING'],
  LEARNING: ['RECOMMENDING'],
  RECOMMENDING: ['MISSIONING', 'REVIEWING'],
  REVIEWING: ['IDLE'],
});

export function createLoopStateMachine({ storage } = {}) {
  const table = storage.tables.loop;

  function userKey(tenantId, userId) {
    return storage.key(tenantId, userId);
  }

  return {
    get({ tenantId, userId }) {
      return storage.get(table, userKey(tenantId, userId)) || {
        phase: 'IDLE',
        enteredAt: storage.now(),
        cycleId: null,
        metadata: {},
      };
    },

    transition({ tenantId, userId }, nextPhase, metadata = {}) {
      const state = this.get({ tenantId, userId });
      const allowed = TRANSITIONS[state.phase] || [];
      if (!allowed.includes(nextPhase)) {
        const err = new Error('growth_loop_invalid_transition');
        err.code = 'GROWTH_LOOP_INVALID_TRANSITION';
        err.details = { from: state.phase, to: nextPhase };
        throw err;
      }
      const cycleId = state.cycleId || `cycle-${Date.now()}`;
      const next = {
        phase: nextPhase,
        enteredAt: storage.now(),
        cycleId,
        metadata: { ...state.metadata, ...metadata },
      };
      storage.put(table, userKey(tenantId, userId), next);
      return next;
    },
  };
}
