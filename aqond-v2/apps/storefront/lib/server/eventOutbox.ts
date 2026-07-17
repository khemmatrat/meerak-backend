import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import type { AqondLifecycleEvent } from '@/lib/server/aqondEventBus';

const OUTBOX_FILE = path.join(process.cwd(), '.data', 'dev', 'event-outbox.json');
const DLQ_FILE = path.join(process.cwd(), '.data', 'dev', 'event-dlq.json');

export type OutboxEntry = {
  id: string;
  event: AqondLifecycleEvent;
  status: 'pending' | 'processing' | 'done' | 'dlq';
  attempts: number;
  last_error?: string;
  created_at: string;
  processed_at?: string;
  idempotency_key: string;
};

type OutboxStore = { entries: OutboxEntry[] };
type DlqStore = { entries: OutboxEntry[] };

async function readOutbox(): Promise<OutboxStore> {
  try {
    return JSON.parse(await fs.readFile(OUTBOX_FILE, 'utf8')) as OutboxStore;
  } catch {
    return { entries: [] };
  }
}

async function writeOutbox(store: OutboxStore) {
  await fs.mkdir(path.dirname(OUTBOX_FILE), { recursive: true });
  await fs.writeFile(OUTBOX_FILE, JSON.stringify(store, null, 2), 'utf8');
}

async function readDlq(): Promise<DlqStore> {
  try {
    return JSON.parse(await fs.readFile(DLQ_FILE, 'utf8')) as DlqStore;
  } catch {
    return { entries: [] };
  }
}

async function writeDlq(store: DlqStore) {
  await fs.mkdir(path.dirname(DLQ_FILE), { recursive: true });
  await fs.writeFile(DLQ_FILE, JSON.stringify(store, null, 2), 'utf8');
}

export function outboxIdempotencyKey(event: AqondLifecycleEvent): string {
  return `${event.order_id}:${event.event_type}:${event.id}`;
}

export async function enqueueOutboxEvent(event: AqondLifecycleEvent): Promise<OutboxEntry> {
  const store = await readOutbox();
  const key = outboxIdempotencyKey(event);
  const existing = store.entries.find((e) => e.idempotency_key === key && e.status !== 'dlq');
  if (existing) return existing;

  const entry: OutboxEntry = {
    id: `ob-${crypto.randomUUID().replace(/-/g, '').slice(0, 14)}`,
    event,
    status: 'pending',
    attempts: 0,
    created_at: new Date().toISOString(),
    idempotency_key: key,
  };
  store.entries.unshift(entry);
  if (store.entries.length > 5000) store.entries.length = 5000;
  await writeOutbox(store);
  return entry;
}

export async function listPendingOutbox(limit = 50): Promise<OutboxEntry[]> {
  const store = await readOutbox();
  return store.entries.filter((e) => e.status === 'pending').slice(0, limit);
}

export async function markOutboxProcessing(entryId: string) {
  const store = await readOutbox();
  const hit = store.entries.find((e) => e.id === entryId);
  if (!hit) return null;
  hit.status = 'processing';
  hit.attempts += 1;
  await writeOutbox(store);
  return hit;
}

export async function markOutboxDone(entryId: string) {
  const store = await readOutbox();
  const hit = store.entries.find((e) => e.id === entryId);
  if (!hit) return null;
  hit.status = 'done';
  hit.processed_at = new Date().toISOString();
  await writeOutbox(store);
  return hit;
}

export async function moveOutboxToDlq(entryId: string, error: string) {
  const store = await readOutbox();
  const hit = store.entries.find((e) => e.id === entryId);
  if (!hit) return null;
  hit.status = 'dlq';
  hit.last_error = error;
  const dlq = await readDlq();
  dlq.entries.unshift({ ...hit });
  if (dlq.entries.length > 2000) dlq.entries.length = 2000;
  await writeDlq(dlq);
  await writeOutbox(store);
  return hit;
}

export async function replayDlqEntry(entryId: string) {
  const dlq = await readDlq();
  const hit = dlq.entries.find((e) => e.id === entryId);
  if (!hit) return null;
  hit.status = 'pending';
  hit.attempts = 0;
  hit.last_error = undefined;
  const store = await readOutbox();
  store.entries.unshift(hit);
  dlq.entries = dlq.entries.filter((e) => e.id !== entryId);
  await writeDlq(dlq);
  await writeOutbox(store);
  return hit;
}

export function useProductionEventBackbone(): boolean {
  return process.env.FOOD_EVENT_BACKBONE === 'pg' || process.env.NODE_ENV === 'production';
}
