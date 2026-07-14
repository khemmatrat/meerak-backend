import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = process.env.AGK_DATA_DIR || path.join(ROOT, 'data');
const MISSIONS_FILE = path.join(DATA_DIR, 'missions.json');

function loadMissions() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(MISSIONS_FILE)) {
    const seed = { version: 1, missions: {} };
    fs.writeFileSync(MISSIONS_FILE, JSON.stringify(seed, null, 2));
    return seed;
  }
  try {
    return JSON.parse(fs.readFileSync(MISSIONS_FILE, 'utf8'));
  } catch {
    return { version: 1, missions: {} };
  }
}

function saveMissions(data) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(MISSIONS_FILE, JSON.stringify(data, null, 2));
}

let store = loadMissions();

export function newMissionId() {
  const n = Math.floor(100000 + Math.random() * 900000);
  return `mission-${n}`;
}

/**
 * Create Mission Session — binds all AI, Service, Audit, Policy, Trace.
 */
export function createMission(input = {}) {
  const missionId = input.mission_id || newMissionId();
  const mission = {
    mission_id: missionId,
    title: input.title || input.user_message?.slice(0, 120) || 'untitled mission',
    user_id: input.user_id || input.buyer_id || null,
    tenant_id: input.tenant_id || null,
    initiator_ai_id: input.ai_id || input.agent_id || null,
    status: 'active',
    created_at: new Date().toISOString(),
    events: [],
    traces: [],
    policies_used: [],
    human_approvals: [],
    services_called: [],
    ais_involved: [],
  };

  store.missions[missionId] = mission;
  saveMissions(store);

  bindMissionEvent(missionId, {
    kind: 'mission.created',
    title: mission.title,
    user_id: mission.user_id,
    initiator_ai_id: mission.initiator_ai_id,
  });

  return mission;
}

export function bindMissionEvent(missionId, event = {}) {
  const mission = store.missions[missionId];
  if (!mission) return null;

  const row = {
    event_id: crypto.randomUUID(),
    recorded_at: new Date().toISOString(),
    ...event,
  };

  mission.events.push(row);
  if (event.trace_id && !mission.traces.includes(event.trace_id)) {
    mission.traces.push(event.trace_id);
  }
  if (event.policy_id && !mission.policies_used.includes(event.policy_id)) {
    mission.policies_used.push(event.policy_id);
  }
  if (event.ai_id && !mission.ais_involved.includes(event.ai_id)) {
    mission.ais_involved.push(event.ai_id);
  }
  if (event.service_id && !mission.services_called.includes(event.service_id)) {
    mission.services_called.push(event.service_id);
  }
  if (event.kind === 'hitl.approved' && event.approver) {
    mission.human_approvals.push({
      approver: event.approver,
      at: row.recorded_at,
      trace_id: event.trace_id,
    });
  }

  if (mission.events.length > 500) mission.events = mission.events.slice(-500);
  saveMissions(store);
  return row;
}

export function getMission(missionId) {
  return store.missions[missionId] || null;
}

export function getMissionTimeline(missionId) {
  const mission = getMission(missionId);
  if (!mission) return null;

  return {
    mission_id: mission.mission_id,
    title: mission.title,
    status: mission.status,
    created_at: mission.created_at,
    summary: {
      who_started: mission.initiator_ai_id || mission.user_id,
      ais: mission.ais_involved,
      services: mission.services_called,
      policies: mission.policies_used,
      trace_count: mission.traces.length,
      human_approvals: mission.human_approvals.length,
    },
    timeline: mission.events,
  };
}

export function missionHealth() {
  return { status: 'up', active_missions: Object.keys(store.missions).length };
}
