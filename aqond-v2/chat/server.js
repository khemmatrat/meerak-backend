import express from "express";

const app = express();
app.use(express.json({ limit: "10mb" }));

const LIVE_COMMERCE_URL = (process.env.LIVE_COMMERCE_URL || "http://live-commerce-svc:8097").replace(/\/$/, "");

app.get("/health", (_req, res) => {
  res.json({ ok: true, service: "chat-service", proxy: LIVE_COMMERCE_URL });
});

/** Legacy stub — forwards to live-commerce-svc when available */
app.post("/messages", async (req, res) => {
  try {
    const r = await fetch(`${LIVE_COMMERCE_URL}/v1/live/faq`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_message: req.body?.text || req.body?.message || "" }),
    });
    const data = await r.json();
    res.json({ ok: true, reply: data.reply_th, forwarded: true });
  } catch (e) {
    res.json({ ok: true, message: req.body, note: "live-commerce unavailable" });
  }
});

app.get("/", (_req, res) => {
  res.json({
    service: "chat-service",
    hint: "Use live-commerce-svc WebSocket /ws for live CF chat",
    live_commerce: LIVE_COMMERCE_URL,
  });
});

const port = Number(process.env.PORT || 8093);
app.listen(port, () => console.log(`chat-service :${port} → ${LIVE_COMMERCE_URL}`));
