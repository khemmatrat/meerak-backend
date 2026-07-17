import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import { bffApi } from '@/lib/server-env';

const DATA_DIR = path.join(process.cwd(), '.data', 'dev');
const BFF_TIMEOUT = 4_000;

type MerchantAiSession = {
  id: string;
  merchant_id: string;
  owner_id: string;
  session_id: string;
  context_json: Record<string, unknown>;
  last_message?: string;
  created_at: string;
  updated_at: string;
};

type RiderAiSession = {
  id: string;
  rider_id: string;
  job_id?: string;
  session_id: string;
  context_json: Record<string, unknown>;
  incident_count: number;
  created_at: string;
  updated_at: string;
};

export type RiderVoiceIncident = {
  id: string;
  rider_id: string;
  job_id?: string;
  order_id?: string;
  transcript: string;
  category: string;
  lat?: number;
  lng?: number;
  status: string;
  created_at: string;
  source?: string;
};

export type UserAiPreferences = {
  user_id: string;
  jarvis_voice_enabled: boolean;
  jarvis_locale: string;
  notify_ai_tips: boolean;
  context_json: Record<string, unknown>;
  updated_at: string;
};

async function bffPost(path: string, body: unknown): Promise<boolean> {
  try {
    const res = await fetch(bffApi(path), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      cache: 'no-store',
      signal: AbortSignal.timeout(BFF_TIMEOUT),
    });
    return res.ok;
  } catch {
    return false;
  }
}

async function bffGet<T>(path: string): Promise<T | null> {
  try {
    const res = await fetch(bffApi(path), {
      cache: 'no-store',
      signal: AbortSignal.timeout(BFF_TIMEOUT),
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

async function readJson<T>(file: string, fallback: T): Promise<T> {
  try {
    return JSON.parse(await fs.readFile(file, 'utf8')) as T;
  } catch {
    return fallback;
  }
}

async function writeJson(file: string, data: unknown) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, JSON.stringify(data, null, 2), 'utf8');
}

const merchantSessionsFile = () => path.join(DATA_DIR, 'merchant-ai-sessions.json');
const riderSessionsFile = () => path.join(DATA_DIR, 'rider-ai-sessions.json');
const incidentsFile = () => path.join(DATA_DIR, 'rider-voice-incidents.json');
const prefsFile = () => path.join(DATA_DIR, 'user-ai-preferences.json');

export async function upsertMerchantAiSession(input: {
  merchant_id: string;
  owner_id?: string;
  session_id?: string;
  last_message?: string;
  context?: Record<string, unknown>;
}) {
  void bffPost('/v1/ai/tier3/merchant-session', {
    merchant_id: input.merchant_id,
    owner_id: input.owner_id || '',
    session_id: input.session_id,
    last_message: input.last_message,
    context: input.context || {},
  });

  const store = await readJson<MerchantAiSession[]>(merchantSessionsFile(), []);
  const sessionId = input.session_id || `ma-${input.merchant_id}`;
  const now = new Date().toISOString();
  const hit = store.find((s) => s.merchant_id === input.merchant_id && s.session_id === sessionId);
  if (hit) {
    hit.last_message = input.last_message || hit.last_message;
    hit.context_json = { ...hit.context_json, ...(input.context || {}) };
    hit.updated_at = now;
  } else {
    store.push({
      id: crypto.randomUUID(),
      merchant_id: input.merchant_id,
      owner_id: input.owner_id || '',
      session_id: sessionId,
      context_json: input.context || {},
      last_message: input.last_message,
      created_at: now,
      updated_at: now,
    });
  }
  await writeJson(merchantSessionsFile(), store.slice(-200));
  return hit || store[store.length - 1];
}

export async function touchRiderAiSession(input: {
  rider_id: string;
  job_id?: string;
  session_id?: string;
  incident?: boolean;
  context?: Record<string, unknown>;
}) {
  void bffPost('/v1/ai/tier3/rider-session', {
    rider_id: input.rider_id,
    job_id: input.job_id,
    session_id: input.session_id,
    incident: !!input.incident,
    context: input.context || {},
  });

  const store = await readJson<RiderAiSession[]>(riderSessionsFile(), []);
  const sessionId = input.session_id || `ra-${input.rider_id}`;
  const now = new Date().toISOString();
  let hit = store.find((s) => s.rider_id === input.rider_id && s.session_id === sessionId);
  if (hit) {
    hit.job_id = input.job_id || hit.job_id;
    hit.context_json = { ...hit.context_json, ...(input.context || {}) };
    if (input.incident) hit.incident_count += 1;
    hit.updated_at = now;
  } else {
    hit = {
      id: crypto.randomUUID(),
      rider_id: input.rider_id,
      job_id: input.job_id,
      session_id: sessionId,
      context_json: input.context || {},
      incident_count: input.incident ? 1 : 0,
      created_at: now,
      updated_at: now,
    };
    store.push(hit);
  }
  await writeJson(riderSessionsFile(), store.slice(-200));
  return hit;
}

export async function saveRiderVoiceIncident(input: {
  rider_id: string;
  job_id?: string;
  order_id?: string;
  transcript: string;
  category: string;
  lat?: number;
  lng?: number;
}): Promise<RiderVoiceIncident> {
  try {
    const res = await fetch(bffApi('/v1/ai/tier3/incidents'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
      cache: 'no-store',
      signal: AbortSignal.timeout(BFF_TIMEOUT),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok && (data as { incident?: RiderVoiceIncident }).incident) {
      const inc = (data as { incident: RiderVoiceIncident }).incident;
      await touchRiderAiSession({
        rider_id: input.rider_id,
        job_id: input.job_id,
        incident: true,
        context: { last_incident_id: inc.id, last_category: input.category },
      });
      return { ...inc, source: 'postgres' };
    }
  } catch {
    /* local fallback */
  }

  const store = await readJson<RiderVoiceIncident[]>(incidentsFile(), []);
  const row: RiderVoiceIncident = {
    id: crypto.randomUUID(),
    rider_id: input.rider_id,
    job_id: input.job_id,
    order_id: input.order_id,
    transcript: input.transcript,
    category: input.category,
    lat: input.lat,
    lng: input.lng,
    status: 'open',
    created_at: new Date().toISOString(),
    source: 'local',
  };
  store.push(row);
  await writeJson(incidentsFile(), store.slice(-500));
  if (input.rider_id) {
    await touchRiderAiSession({
      rider_id: input.rider_id,
      job_id: input.job_id,
      incident: true,
      context: { last_incident_id: row.id, last_category: input.category },
    });
  }
  return row;
}

export async function listRiderIncidents(jobId?: string, limit = 20) {
  const q = jobId ? `?job_id=${encodeURIComponent(jobId)}` : '';
  const remote = await bffGet<{ incidents?: RiderVoiceIncident[] }>(`/v1/ai/tier3/incidents${q}`);
  if (remote?.incidents?.length) {
    return remote.incidents.slice(0, limit);
  }
  const store = await readJson<RiderVoiceIncident[]>(incidentsFile(), []);
  const filtered = jobId ? store.filter((i) => i.job_id === jobId) : store;
  return filtered.slice(-limit).reverse();
}

export async function listIncidentsForOrder(orderId: string, limit = 20): Promise<RiderVoiceIncident[]> {
  const remote = await bffGet<{ incidents?: RiderVoiceIncident[] }>(
    `/v1/ai/tier3/incidents?order_id=${encodeURIComponent(orderId)}`,
  );
  if (remote?.incidents?.length) {
    return remote.incidents.filter((i) => i.order_id === orderId).slice(0, limit);
  }
  const store = await readJson<RiderVoiceIncident[]>(incidentsFile(), []);
  return store.filter((i) => i.order_id === orderId).slice(-limit).reverse();
}

export async function getUserAiPreferences(userId: string): Promise<UserAiPreferences> {
  const remote = await bffGet<{ preferences?: UserAiPreferences }>(
    `/v1/ai/tier3/user-preferences?user_id=${encodeURIComponent(userId)}`,
  );
  if (remote?.preferences) {
    return {
      ...remote.preferences,
      updated_at: remote.preferences.updated_at || new Date().toISOString(),
    };
  }
  const store = await readJson<Record<string, UserAiPreferences>>(prefsFile(), {});
  return store[userId] || {
    user_id: userId,
    jarvis_voice_enabled: true,
    jarvis_locale: 'th-TH',
    notify_ai_tips: true,
    context_json: {},
    updated_at: new Date().toISOString(),
  };
}

export async function saveUserAiPreferences(
  userId: string,
  patch: Partial<Omit<UserAiPreferences, 'user_id' | 'updated_at'>>,
): Promise<UserAiPreferences> {
  const prev = await getUserAiPreferences(userId);
  const next: UserAiPreferences = {
    ...prev,
    ...patch,
    user_id: userId,
    context_json: { ...prev.context_json, ...(patch.context_json || {}) },
    updated_at: new Date().toISOString(),
  };

  const saved = await bffPost('/v1/ai/tier3/user-preferences', {
    user_id: userId,
    jarvis_voice_enabled: next.jarvis_voice_enabled,
    jarvis_locale: next.jarvis_locale,
    notify_ai_tips: next.notify_ai_tips,
    context_json: next.context_json,
  });

  if (!saved) {
    const store = await readJson<Record<string, UserAiPreferences>>(prefsFile(), {});
    store[userId] = next;
    await writeJson(prefsFile(), store);
  }
  return next;
}
