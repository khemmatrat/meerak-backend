import express from "express";
import Redis from "ioredis";
import { assertProdSecrets } from "./lib/prod-guard.js";

const app = express();
app.use(express.json());

const API_KEY = process.env.NOTIFY_API_KEY || "";

assertProdSecrets([{ name: "NOTIFY_API_KEY", value: API_KEY }]);

const redis = process.env.REDIS_URL ? new Redis(process.env.REDIS_URL) : null;

function auth(req, res, next) {
  const key = req.headers["x-notify-api-key"] || "";
  if (!API_KEY || key === API_KEY) return next();
  return res.status(401).json({ error: "unauthorized" });
}

app.get("/health", (_req, res) => {
  res.json({ ok: true, service: "notify-service", backend: redis ? "redis" : "memory" });
});

/**
 * POST /push — lightweight Novu alternative
 * tier-1 merchant stream start => instant app push signal
 */
app.post("/push", auth, async (req, res) => {
  const { user_id, title, body, channel = "push", metadata = {} } = req.body || {};
  if (!user_id || !title) return res.status(400).json({ error: "user_id and title required" });

  const event = {
    id: `ntf_${Date.now()}`,
    user_id,
    title,
    body: body || "",
    channel,
    metadata,
    created_at: new Date().toISOString(),
  };

  if (redis) {
    await redis.lpush(`notify:${user_id}`, JSON.stringify(event));
    await redis.ltrim(`notify:${user_id}`, 0, 99);
  }

  console.log("[notify]", event);
  res.status(202).json({ queued: true, event });
});

/** POST /stream-live — P6 hook when tier-1 merchant goes live */
app.post("/stream-live", auth, async (req, res) => {
  const { merchant_id, stream_id, tier = "tier-1" } = req.body || {};
  if (tier !== "tier-1") {
    return res.json({ skipped: true, reason: "not_tier_1" });
  }
  const event = {
    id: `ntf_live_${Date.now()}`,
    user_id: `followers_of_${merchant_id}`,
    title: "ร้านที่คุณติดตามเริ่มไลฟ์แล้ว!",
    body: `Stream ${stream_id} is live`,
    channel: "push",
    metadata: { merchant_id, stream_id, type: "stream_live" },
    created_at: new Date().toISOString(),
  };
  if (redis) {
    await redis.lpush(`notify:${event.user_id}`, JSON.stringify(event));
  }
  console.log("[notify] stream-live", event);
  res.status(202).json({ queued: true, event });
});

const port = Number(process.env.PORT || 8096);
app.listen(port, () => console.log(`notify-service :${port}`));
