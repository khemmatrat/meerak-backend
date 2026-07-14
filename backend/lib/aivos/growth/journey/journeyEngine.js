import { JOURNEY_STAGES } from '../config.js';
import { isJourneyFsmEnabled } from '../config.js';
import { assertGrowthWriteOwner } from '../domain/ownershipMatrix.js';
import {
  JourneyState,
  transitionJourney,
  journeyStateIndex,
} from './journeyFSM.js';

export function createJourneyEngine({ storage, metrics, audit } = {}) {
  const owner = 'growth.journey';
  const table = storage.tables.journeys;

  function userKey(tenantId, userId) {
    return storage.key(tenantId, userId);
  }

  function defaultState(tenantId, userId) {
    return {
      tenantId,
      userId,
      journeyId: `journey-${tenantId}-${userId}`,
      currentStage: JOURNEY_STAGES[0],
      stageIndex: 0,
      fsmState: JourneyState.ONBOARDING,
      stageHistory: [],
      completed: false,
    };
  }

  return {
    get({ tenantId, userId }) {
      const row = storage.get(table, userKey(tenantId, userId));
      return row || defaultState(tenantId, userId);
    },

    onEvent({ tenantId, userId }, event) {
      if (!isJourneyFsmEnabled()) return this.get({ tenantId, userId });
      assertGrowthWriteOwner(owner, table);
      const state = this.get({ tenantId, userId });
      const nextFsm = transitionJourney(state.fsmState || JourneyState.ONBOARDING, event);
      const next = {
        ...state,
        fsmState: nextFsm,
        stageIndex: journeyStateIndex(nextFsm),
        currentStage: nextFsm.toLowerCase(),
        stageHistory: [
          ...state.stageHistory,
          { event, to: nextFsm, at: storage.now() },
        ],
        updatedAt: storage.now(),
        completed: nextFsm === JourneyState.MASTER,
      };
      storage.put(table, userKey(tenantId, userId), next);
      metrics?.record?.({ tenantId, action: 'journey.fsm', success: true });
      audit?.record?.({ action: 'journey.fsm', tenantId, diff: { userId, fsmState: nextFsm } });
      return next;
    },

    advance({ tenantId, userId }, { reason } = {}) {
      assertGrowthWriteOwner(owner, table);
      const state = this.get({ tenantId, userId });
      if (state.completed) return state;

      const nextIndex = Math.min(state.stageIndex + 1, JOURNEY_STAGES.length - 1);
      const nextStage = JOURNEY_STAGES[nextIndex];
      const entry = {
        from: state.currentStage,
        to: nextStage,
        at: storage.now(),
        reason: reason || 'advance',
      };
      const next = {
        ...state,
        currentStage: nextStage,
        stageIndex: nextIndex,
        stageHistory: [...state.stageHistory, entry],
        completed: nextIndex >= JOURNEY_STAGES.length - 1,
        updatedAt: storage.now(),
      };
      storage.put(table, userKey(tenantId, userId), next);
      metrics?.record?.({ tenantId, action: 'journey.advance', success: true });
      audit?.record?.({ action: 'journey.advance', tenantId, diff: { userId, stage: nextStage } });
      return next;
    },

    rollback({ tenantId, userId }) {
      assertGrowthWriteOwner(owner, table);
      const state = this.get({ tenantId, userId });
      if (state.stageIndex <= 0) return state;
      const prevIndex = state.stageIndex - 1;
      const prevStage = JOURNEY_STAGES[prevIndex];
      const next = {
        ...state,
        currentStage: prevStage,
        stageIndex: prevIndex,
        completed: false,
        stageHistory: [
          ...state.stageHistory,
          { from: state.currentStage, to: prevStage, at: storage.now(), reason: 'rollback' },
        ],
        updatedAt: storage.now(),
      };
      storage.put(table, userKey(tenantId, userId), next);
      audit?.record?.({ action: 'journey.rollback', tenantId, diff: { userId, stage: prevStage } });
      return next;
    },
  };
}
