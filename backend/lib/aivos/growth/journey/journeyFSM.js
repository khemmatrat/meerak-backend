import { isJourneyFsmEnabled } from '../config.js';

export const JourneyState = Object.freeze({
  ONBOARDING: 'ONBOARDING',
  DISCOVERY: 'DISCOVERY',
  FIRST_SUCCESS: 'FIRST_SUCCESS',
  GROWING: 'GROWING',
  PRO: 'PRO',
  MASTER: 'MASTER',
});

const ORDER = [
  JourneyState.ONBOARDING,
  JourneyState.DISCOVERY,
  JourneyState.FIRST_SUCCESS,
  JourneyState.GROWING,
  JourneyState.PRO,
  JourneyState.MASTER,
];

const TRANSITIONS = Object.freeze({
  MISSION_COMPLETED: 1,
  HABIT_STREAK_7: 1,
  REVENUE_MILESTONE: 1,
  TENANT_UPGRADE: 1,
});

export function nextJourneyState(state) {
  const idx = ORDER.indexOf(state);
  if (idx < 0 || idx >= ORDER.length - 1) return state;
  return ORDER[idx + 1];
}

export function transitionJourney(state, event) {
  if (!isJourneyFsmEnabled()) return state;
  const step = TRANSITIONS[event];
  if (!step) return state;
  if (event === 'MISSION_COMPLETED') return nextJourneyState(state);
  return nextJourneyState(state);
}

export function journeyStateIndex(state) {
  const idx = ORDER.indexOf(state);
  return idx >= 0 ? idx : 0;
}
