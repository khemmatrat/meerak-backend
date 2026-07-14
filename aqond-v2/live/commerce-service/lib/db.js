import pg from "pg";
import { createClient } from "redis";

const pool = new pg.Pool({
  host: process.env.PGHOST || "aqond-db",
  port: Number(process.env.PGPORT || 5432),
  user: process.env.PGUSER || "admin_boss",
  password: process.env.PGPASSWORD,
  database: process.env.PGDATABASE || "commerce",
});

let redis = null;
export async function getRedis() {
  if (redis) return redis;
  const url = process.env.REDIS_URL || `redis://${process.env.REDIS_HOST || "aqond-redis"}:6379`;
  redis = createClient({ url });
  redis.on("error", (e) => console.warn("[redis]", e.message));
  await redis.connect();
  return redis;
}

export async function query(text, params) {
  return pool.query(text, params);
}

export { pool };
