/**
 * Shared store for Redis and Pool (injected by index.ts).
 * Used by webhook controller for idempotency and DB updates.
 */
import type { Pool } from "pg";

type RedisClient = {
  setEx: (k: string, t: number, v: string) => Promise<void>;
  get: (k: string) => Promise<string | null>;
};

let _redis: RedisClient | null = null;
let _pool: Pool | null = null;

export function setRedis(client: RedisClient | null): void {
  _redis = client;
}

export function setPool(pool: Pool | null): void {
  _pool = pool;
}

export function getRedis(): RedisClient | null {
  return _redis;
}

export function getPool(): Pool | null {
  return _pool;
}
