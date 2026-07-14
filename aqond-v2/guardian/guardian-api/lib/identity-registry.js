import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = process.env.AGK_DATA_DIR || path.join(ROOT, 'data');
const REGISTRY_FILE = path.join(DATA_DIR, 'ai-id-registry.json');

const SEED_AGENTS = [
  {
    ai_id: 'jarvis-prod-01',
    agent_class: 'jarvis',
    environment: 'production',
    status: 'active',
    capabilities: ['concierge', 'search', 'compare'],
    registered_at: new Date().toISOString(),
  },
  {
    ai_id: 'hermes-worker-01',
    agent_class: 'hermes',
    environment: 'production',
    status: 'registered',
    capabilities: ['orchestration'],
    registered_at: new Date().toISOString(),
  },
];

function ensureDataDir() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

function loadRegistry() {
  ensureDataDir();
  if (!fs.existsSync(REGISTRY_FILE)) {
    const seed = { version: 1, agents: SEED_AGENTS };
    fs.writeFileSync(REGISTRY_FILE, JSON.stringify(seed, null, 2));
    return seed;
  }
  try {
    return JSON.parse(fs.readFileSync(REGISTRY_FILE, 'utf8'));
  } catch {
    return { version: 1, agents: [...SEED_AGENTS] };
  }
}

function saveRegistry(data) {
  ensureDataDir();
  fs.writeFileSync(REGISTRY_FILE, JSON.stringify(data, null, 2));
}

let registry = loadRegistry();

export function getAgent(aiId) {
  return registry.agents.find((a) => a.ai_id === aiId) || null;
}

export function listAgents() {
  return registry.agents;
}

/** Skeleton register — audit only; no cert issuance in Phase 1.1 */
export function registerAgent(input) {
  const aiId = String(input.ai_id || '').trim();
  if (!aiId) return { ok: false, error: 'ai_id required' };

  const existing = getAgent(aiId);
  if (existing) {
    return { ok: true, agent: existing, created: false };
  }

  const agent = {
    ai_id: aiId,
    agent_class: input.agent_class || 'unknown',
    environment: input.environment || 'staging',
    status: 'registered',
    capabilities: Array.isArray(input.capabilities) ? input.capabilities : [],
    registered_at: new Date().toISOString(),
    registry_id: crypto.randomUUID(),
  };
  registry.agents.push(agent);
  saveRegistry(registry);
  return { ok: true, agent, created: true };
}

export function registryHealth() {
  return { status: 'up', count: registry.agents.length };
}

export function updateAgentStatus(aiId, status) {
  const agent = registry.agents.find((a) => a.ai_id === aiId);
  if (!agent) return false;
  agent.status = status;
  agent.updated_at = new Date().toISOString();
  saveRegistry(registry);
  return true;
}
