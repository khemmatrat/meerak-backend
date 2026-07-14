import fs from 'fs/promises';
import path from 'path';

const PRESENCE_FILE = path.join(process.cwd(), '.data', 'dev', 'rider-presence.json');

export type RiderPresence = {
  rider_id: string;
  online: boolean;
  lat?: number;
  lng?: number;
  speed_kmh?: number;
  battery_pct?: number;
  heading?: number;
  current_job_id?: string;
  updated_at: string;
};

type PresenceStore = { riders: Record<string, RiderPresence> };

async function readStore(): Promise<PresenceStore> {
  try {
    return JSON.parse(await fs.readFile(PRESENCE_FILE, 'utf8')) as PresenceStore;
  } catch {
    return { riders: {} };
  }
}

async function writeStore(store: PresenceStore) {
  await fs.mkdir(path.dirname(PRESENCE_FILE), { recursive: true });
  await fs.writeFile(PRESENCE_FILE, JSON.stringify(store, null, 2), 'utf8');
}

export async function getRiderPresence(riderId: string): Promise<RiderPresence | null> {
  const store = await readStore();
  return store.riders[riderId] || null;
}

export async function setRiderOnline(riderId: string, online: boolean) {
  const store = await readStore();
  const prev = store.riders[riderId];
  store.riders[riderId] = {
    rider_id: riderId,
    online,
    lat: prev?.lat,
    lng: prev?.lng,
    speed_kmh: prev?.speed_kmh,
    battery_pct: prev?.battery_pct,
    current_job_id: online ? prev?.current_job_id : undefined,
    updated_at: new Date().toISOString(),
  };
  await writeStore(store);
  return store.riders[riderId];
}

export async function updateRiderTelemetry(
  riderId: string,
  input: {
    lat?: number;
    lng?: number;
    speed_kmh?: number;
    battery_pct?: number;
    heading?: number;
    current_job_id?: string;
    online?: boolean;
  },
) {
  const store = await readStore();
  const prev = store.riders[riderId];
  store.riders[riderId] = {
    rider_id: riderId,
    online: input.online ?? prev?.online ?? false,
    lat: input.lat ?? prev?.lat,
    lng: input.lng ?? prev?.lng,
    speed_kmh: input.speed_kmh ?? prev?.speed_kmh,
    battery_pct: input.battery_pct ?? prev?.battery_pct,
    heading: input.heading ?? prev?.heading,
    current_job_id: input.current_job_id ?? prev?.current_job_id,
    updated_at: new Date().toISOString(),
  };
  await writeStore(store);
  return store.riders[riderId];
}

export async function listOnlineRiders(): Promise<RiderPresence[]> {
  const store = await readStore();
  return Object.values(store.riders).filter((r) => r.online);
}

export async function listAllRiderPresence(): Promise<RiderPresence[]> {
  const store = await readStore();
  return Object.values(store.riders);
}
