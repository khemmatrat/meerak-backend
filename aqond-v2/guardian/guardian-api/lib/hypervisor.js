import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { getAgent, updateAgentStatus } from './identity-registry.js';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = process.env.AGK_DATA_DIR || path.join(ROOT, 'data');
const STATE_FILE = path.join(DATA_DIR, 'hypervisor-state.json');

function loadState() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(STATE_FILE)) {
    const seed = { global_kill: false, agent_kills: {}, tenant_kills: {}, history: [] };
    fs.writeFileSync(STATE_FILE, JSON.stringify(seed, null, 2));
    return seed;
  }
  try {
    return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
  } catch {
    return { global_kill: false, agent_kills: {}, tenant_kills: {}, history: [] };
  }
}

function saveState(state) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

let state = loadState();

export function hypervisorHealth() {
  return {
    status: 'up',
    global_kill: state.global_kill,
    agent_kills: Object.keys(state.agent_kills).length,
    tenant_kills: Object.keys(state.tenant_kills).length,
  };
}

export function hypervisorCheck(aiId, tenantId) {
  if (state.global_kill) {
    return { ok: false, code: 'guardian.unavailable', reason: 'hypervisor.global_kill' };
  }
  if (tenantId && state.tenant_kills[tenantId]) {
    return { ok: false, code: 'guardian.unavailable', reason: 'hypervisor.tenant_kill' };
  }
  if (aiId && state.agent_kills[aiId]) {
    return { ok: false, code: 'guardian.unavailable', reason: 'hypervisor.agent_kill' };
  }
  const agent = aiId ? getAgent(aiId) : null;
  if (agent?.status === 'suspended') {
    return { ok: false, code: 'guardian.unavailable', reason: 'hypervisor.agent_suspended' };
  }
  return { ok: true };
}

/**
 * scope: global | tenant | agent
 */
export function applyKill(input = {}) {
  const scope = input.scope || 'agent';
  const reason = input.reason || 'operator_kill';
  const at = new Date().toISOString();
  const record = { scope, reason, at, operator: input.operator || 'system', trace_id: input.trace_id };

  if (scope === 'global') {
    state.global_kill = true;
    record.effect = 'all_agents_blocked';
  } else if (scope === 'tenant') {
    const tid = input.tenant_id || input.target_id;
    if (!tid) return { ok: false, error: 'tenant_id required' };
    state.tenant_kills[tid] = { reason, at };
    record.target = tid;
  } else {
    const aiId = input.ai_id || input.target_id;
    if (!aiId) return { ok: false, error: 'ai_id required' };
    state.agent_kills[aiId] = { reason, at };
    updateAgentStatus(aiId, 'suspended');
    record.target = aiId;
  }

  state.history.push(record);
  if (state.history.length > 500) state.history = state.history.slice(-500);
  saveState(state);
  return { ok: true, ...record };
}

export function reinstateKill(input = {}) {
  const scope = input.scope || 'agent';
  const at = new Date().toISOString();

  if (scope === 'global') {
    state.global_kill = false;
  } else if (scope === 'tenant') {
    const tid = input.tenant_id || input.target_id;
    delete state.tenant_kills[tid];
  } else {
    const aiId = input.ai_id || input.target_id;
    delete state.agent_kills[aiId];
    const agent = getAgent(aiId);
    if (agent?.status === 'suspended') updateAgentStatus(aiId, 'active');
  }

  saveState(state);
  return { ok: true, scope, at };
}

export function getHypervisorStatus() {
  return {
    global_kill: state.global_kill,
    agent_kills: state.agent_kills,
    tenant_kills: state.tenant_kills,
    recent: state.history.slice(-10),
  };
}
