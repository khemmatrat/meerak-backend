import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import { AccessToken, RoomServiceClient, DataPacket_Kind } from "livekit-server-sdk";
import { assertProdSecrets, requireApiKey, isProduction, isWeakSecret } from "./lib/prod-guard.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.use(express.json());

const API_KEY = process.env.LIVEKIT_API_KEY || "devkey";
const API_SECRET = process.env.LIVEKIT_API_SECRET || "dev-livekit-secret-min-32-chars-ok";
const LIVEKIT_HTTP = (process.env.LIVEKIT_HTTP_URL || "http://livekit:7880").replace(/\/$/, "");
const LIVEKIT_PUBLIC_WS =
  process.env.LIVEKIT_PUBLIC_URL || process.env.LIVEKIT_URL || "ws://localhost:7880";
const MARKETPLACE_URL = (process.env.MARKETPLACE_URL || "http://marketplace-web:8080").replace(/\/$/, "");
const NOTIFY_URL = (process.env.NOTIFY_SERVICE_URL || "http://notify-service:8096").replace(/\/$/, "");
const NOTIFY_KEY = process.env.NOTIFY_API_KEY || "";
const LIVE_MERCHANT_API_KEY = process.env.LIVE_MERCHANT_API_KEY || "";
const merchantAuth = requireApiKey(LIVE_MERCHANT_API_KEY, ["x-live-merchant-api-key", "x-api-key"]);

assertProdSecrets([
  { name: "LIVEKIT_API_SECRET", value: API_SECRET, minLength: 24 },
  { name: "LIVE_MERCHANT_API_KEY", value: LIVE_MERCHANT_API_KEY },
]);

if (isProduction() && isWeakSecret(API_SECRET, { minLength: 24 })) {
  console.error("[FATAL] LIVEKIT_API_SECRET too weak for production");
  process.exit(1);
}

const roomService = new RoomServiceClient(LIVEKIT_HTTP, API_KEY, API_SECRET);

/** In-memory F-Code overlay + session registry (PoC) */
const roomOverlays = new Map();
/** room -> Map<slot, overlay> for multi F-code */
const roomPinned = new Map();
const liveSessions = new Map();
const LIVE_COMMERCE_URL = (process.env.LIVE_COMMERCE_URL || "http://live-commerce-svc:8097").replace(/\/$/, "");

function publicWatchUrl(roomName) {
  return `/api/v1/live/watch?room=${encodeURIComponent(roomName)}`;
}

async function mintToken({ room_name, identity, name, can_publish = false }) {
  const at = new AccessToken(API_KEY, API_SECRET, {
    identity: String(identity),
    name: name || identity,
  });
  at.addGrant({
    roomJoin: true,
    room: room_name,
    canPublish: !!can_publish,
    canSubscribe: true,
    canPublishData: !!can_publish,
  });
  return at.toJwt();
}

async function syncPinToCommerce(roomName, merchantId, slot, overlay) {
  try {
    await fetch(`${LIVE_COMMERCE_URL}/v1/live/pin`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Live-Merchant-Api-Key": LIVE_MERCHANT_API_KEY,
      },
      body: JSON.stringify({
        room_id: roomName,
        merchant_id: merchantId,
        slot,
        product_id: overlay.product_id,
        external_id: overlay.external_id,
        title: overlay.title,
        price_thb: overlay.price_thb,
        image_url: overlay.image_url,
        inventory: overlay.inventory,
        purchase_limit_per_user: overlay.purchase_limit_per_user || 0,
      }),
      signal: AbortSignal.timeout(10000),
    });
  } catch (e) {
    console.warn("[live-token] commerce sync:", e.message);
  }
}

async function broadcastOverlay(roomName, overlay, slot = 1) {
  roomOverlays.set(roomName, overlay);
  if (!roomPinned.has(roomName)) roomPinned.set(roomName, new Map());
  roomPinned.get(roomName).set(slot, overlay);
  const payload = JSON.stringify({ type: "f-code", overlay, slot, pinned: [...roomPinned.get(roomName).entries()].map(([s, o]) => ({ slot: s, ...o })) });
  try {
    await roomService.updateRoomMetadata(roomName, payload);
    await roomService.sendData(
      roomName,
      new Uint8Array(Buffer.from(payload, "utf8")),
      DataPacket_Kind.RELIABLE,
    );
  } catch (e) {
    console.warn("[live-token] LiveKit broadcast:", e.message);
  }
}

async function loadProduct(externalId) {
  const r = await fetch(`${MARKETPLACE_URL}/products/${encodeURIComponent(externalId)}`, {
    signal: AbortSignal.timeout(15000),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok || !data.product) return null;
  return data.product;
}

async function notifyStreamLive(merchantId, roomName, tier) {
  if (tier !== "tier-1" || !NOTIFY_KEY) return { skipped: true };
  try {
    const r = await fetch(`${NOTIFY_URL}/stream-live`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Notify-Api-Key": NOTIFY_KEY,
      },
      body: JSON.stringify({ merchant_id: merchantId, stream_id: roomName, tier }),
      signal: AbortSignal.timeout(10000),
    });
    return r.json().catch(() => ({}));
  } catch (e) {
    return { skipped: true, error: e.message };
  }
}

app.get("/health", (_req, res) => {
  res.json({
    ok: true,
    service: "live-token-service",
    p4: { f_code: true, studio: true, watch: true },
    livekit_ws: LIVEKIT_PUBLIC_WS,
  });
});

app.get("/merchant-config.js", (_req, res) => {
  res.type("application/javascript");
  res.set("Cache-Control", "no-store");
  const key = isProduction() && LIVE_MERCHANT_API_KEY ? LIVE_MERCHANT_API_KEY : "";
  res.send(`window.__LIVE_MERCHANT_API_KEY__=${JSON.stringify(key)};`);
});

app.get("/studio", (_req, res) => {
  res.sendFile(path.join(__dirname, "public", "studio.html"));
});

app.get("/watch", (_req, res) => {
  res.sendFile(path.join(__dirname, "public", "watch.html"));
});

/** POST /room — merchant starts live session */
app.post("/room", merchantAuth, async (req, res) => {
  const { merchant_id = "merchant-demo", tier = "free", title = "AQOND Live" } = req.body || {};
  const roomName = `live-${merchant_id}-${Date.now().toString(36)}`;
  const sellerIdentity = `seller-${merchant_id}`;

  try {
    await roomService.createRoom({
      name: roomName,
      emptyTimeout: 600,
      metadata: JSON.stringify({ merchant_id, tier, title }),
    });
  } catch (e) {
    if (!String(e.message).includes("already exists")) {
      return res.status(502).json({ error: "livekit_create_failed", detail: e.message });
    }
  }

  const session = {
    room_name: roomName,
    merchant_id,
    tier,
    title,
    started_at: new Date().toISOString(),
    watch_url: publicWatchUrl(roomName),
  };
  liveSessions.set(roomName, session);

  const sellerToken = await mintToken({
    room_name: roomName,
    identity: sellerIdentity,
    name: merchant_id,
    can_publish: true,
  });

  const notify = await notifyStreamLive(merchant_id, roomName, tier);

  res.status(201).json({
    ok: true,
    session,
    token: sellerToken,
    url: LIVEKIT_PUBLIC_WS,
    room: roomName,
    notify,
  });
});

/** POST /token — viewer or seller WebRTC token */
app.post("/token", async (req, res) => {
  const { room_name, identity, name, can_publish = false } = req.body || {};
  if (!room_name || !identity) {
    return res.status(400).json({ error: "room_name and identity required" });
  }
  const token = await mintToken({ room_name, identity, name, can_publish });
  res.json({ token, url: LIVEKIT_PUBLIC_WS, room: room_name });
});

/**
 * POST /f-code — push product overlay (F-Code) to live room
 * Body: { room_name, product_id | external_id, title?, price_thb?, image_url? }
 */
app.post("/f-code", merchantAuth, async (req, res) => {
  const { room_name, product_id, external_id, title, price_thb, image_url, slot = 1, purchase_limit_per_user = 0 } = req.body || {};
  if (!room_name) return res.status(400).json({ error: "room_name required" });

  const session = liveSessions.get(room_name);
  const merchantId = session?.merchant_id || "merchant-demo";

  let overlay;
  const ext = external_id || product_id;
  if (ext) {
    const product = await loadProduct(ext);
    if (product) {
      overlay = {
        f_code: slot > 1 ? `F${slot}` : `F-${String(ext).slice(-8).toUpperCase()}`,
        slot,
        product_id: ext,
        external_id: ext,
        title: product.title,
        price_thb: Number(product.price_thb ?? product.price),
        image_url: product.image_uris?.[0] || "",
        inventory: product.inventory,
        purchase_limit_per_user: Number(purchase_limit_per_user) || Number(product.purchase_limit_per_user) || 0,
        updated_at: new Date().toISOString(),
      };
    }
  }

  if (!overlay) {
    if (!product_id && !external_id) {
      return res.status(400).json({ error: "product_id or external_id required" });
    }
    overlay = {
      f_code: slot > 1 ? `F${slot}` : `F-${String(ext).slice(-8).toUpperCase()}`,
      slot,
      product_id: ext,
      external_id: ext,
      title: title || "สินค้าไลฟ์",
      price_thb: Number(price_thb) || 0,
      image_url: image_url || "",
      purchase_limit_per_user: Number(purchase_limit_per_user) || 0,
      updated_at: new Date().toISOString(),
    };
  }

  await broadcastOverlay(room_name, overlay, slot);
  await syncPinToCommerce(room_name, merchantId, slot, overlay);
  res.json({ ok: true, overlay, pinned: [...(roomPinned.get(room_name)?.entries() || [])].map(([s, o]) => ({ slot: s, ...o })) });
});

app.get("/pinned/:room", (req, res) => {
  const pinned = roomPinned.get(req.params.room);
  const list = pinned ? [...pinned.entries()].map(([slot, o]) => ({ slot, ...o })) : [];
  res.json({ ok: true, room: req.params.room, pinned: list, overlay: roomOverlays.get(req.params.room) || null });
});

app.get("/overlay/:room", (req, res) => {
  res.json({ ok: true, overlay: roomOverlays.get(req.params.room) || null });
});

app.get("/sessions/:room", (req, res) => {
  const session = liveSessions.get(req.params.room);
  if (!session) return res.status(404).json({ error: "not_found" });
  res.json({ ok: true, session, overlay: roomOverlays.get(req.params.room) || null });
});

const port = Number(process.env.PORT || 8092);
app.listen(port, () => console.log(`live-token-service :${port} (P4 LiveKit + F-Code)`));
