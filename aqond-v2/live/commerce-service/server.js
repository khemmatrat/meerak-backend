import express from "express";
import http from "http";
import path from "path";
import { fileURLToPath } from "url";
import { WebSocketServer } from "ws";
import { ulid } from "ulid";
import { query, getRedis } from "./lib/db.js";
import { parseFCommand } from "./lib/f-parser.js";
import {
  flashBuy,
  getProductVariants,
  listAddresses,
  createAddress,
  attachShippingAddress,
  updateFulfillment,
  createLabel,
  aiParseAddress,
  aiFaqReply,
  ocrSlip,
} from "./lib/clients.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.use(express.json({ limit: "20mb" }));

const PORT = Number(process.env.PORT || 8097);
const LIVE_TOKEN_URL = (process.env.LIVE_TOKEN_URL || "http://live-token-service:8092").replace(/\/$/, "");
const MERCHANT_KEY = process.env.LIVE_MERCHANT_API_KEY || "";

/** room_id -> Set<WebSocket> */
const roomSockets = new Map();

function merchantAuth(req, res, next) {
  const key = req.headers["x-live-merchant-api-key"] || req.headers["x-api-key"] || "";
  if (!MERCHANT_KEY || key === MERCHANT_KEY) return next();
  return res.status(401).json({ error: "unauthorized" });
}

function broadcastRoom(roomId, msg) {
  const payload = JSON.stringify(msg);
  const set = roomSockets.get(roomId);
  if (!set) return;
  for (const ws of set) {
    if (ws.readyState === 1) ws.send(payload);
  }
}

async function saveChatMessage(roomId, userId, userName, kind, body, payload = {}) {
  const id = ulid();
  await query(
    `INSERT INTO commerce.live_chat_messages (id, room_id, user_id, user_name, kind, body, payload)
     VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    [id, roomId, userId, userName, kind, body, JSON.stringify(payload)],
  );
  return id;
}

async function getPinnedProduct(roomId, { slot, fCode }) {
  if (fCode) {
    const r = await query(
      `SELECT * FROM commerce.live_pinned_products WHERE room_id=$1 AND f_code=$2 LIMIT 1`,
      [roomId, fCode.toUpperCase()],
    );
    return r.rows[0] || null;
  }
  if (slot != null) {
    const r = await query(
      `SELECT * FROM commerce.live_pinned_products WHERE room_id=$1 AND slot=$2 LIMIT 1`,
      [roomId, slot],
    );
    return r.rows[0] || null;
  }
  // default: slot 1 or latest pinned
  const r = await query(
    `SELECT * FROM commerce.live_pinned_products WHERE room_id=$1 ORDER BY slot ASC LIMIT 1`,
    [roomId],
  );
  return r.rows[0] || null;
}

async function checkPurchaseLimit(roomId, productId, buyerId, addQty, limit) {
  if (!limit || limit <= 0) return { ok: true, remaining: 999 };
  const r = await query(
    `SELECT qty FROM commerce.live_purchase_counters WHERE room_id=$1 AND product_id=$2 AND buyer_id=$3`,
    [roomId, productId, buyerId],
  );
  const current = r.rows[0]?.qty || 0;
  if (current + addQty > limit) {
    return { ok: false, remaining: Math.max(0, limit - current), limit };
  }
  return { ok: true, remaining: limit - current - addQty, limit };
}

async function incrementPurchaseCounter(roomId, productId, buyerId, qty) {
  await query(
    `INSERT INTO commerce.live_purchase_counters (room_id, product_id, buyer_id, qty)
     VALUES ($1,$2,$3,$4)
     ON CONFLICT (room_id, product_id, buyer_id)
     DO UPDATE SET qty = commerce.live_purchase_counters.qty + EXCLUDED.qty, updated_at=NOW()`,
    [roomId, productId, buyerId, qty],
  );
}

async function handleFCommand(roomId, userId, userName, text) {
  const cmd = parseFCommand(text);
  if (!cmd) return null;

  const pinned = await getPinnedProduct(roomId, cmd);
  if (!pinned) {
    const id = await saveChatMessage(roomId, userId, userName, "system", "ยังไม่มีสินค้าที่ปักหมุดในไลฟ์นี้ครับ", {});
    broadcastRoom(roomId, {
      type: "chat",
      message: { id, kind: "system", body: "ยังไม่มีสินค้าที่ปักหมุดในไลฟ์นี้ครับ", user_name: "AQOND" },
    });
    return null;
  }

  const limit = pinned.purchase_limit_per_user || 0;
  const check = await checkPurchaseLimit(roomId, pinned.product_id, userId, 1, limit);

  const draftId = ulid();
  const variants = await getProductVariants(pinned.product_id);
  const variantId = variants[0]?.id || pinned.product_id;

  await query(
    `INSERT INTO commerce.live_orders
      (id, room_id, merchant_id, buyer_id, buyer_name, product_id, variant_id, f_code, qty, status, metadata)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,1,'draft',$9)`,
    [
      draftId,
      roomId,
      pinned.merchant_id,
      userId,
      userName,
      pinned.product_id,
      variantId,
      pinned.f_code,
      JSON.stringify({ price_micro: pinned.price_micro, title: pinned.title, limit }),
    ],
  );

  const card = {
    type: "order_draft",
    draft_id: draftId,
    f_code: pinned.f_code,
    title: pinned.title,
    price_micro: Number(pinned.price_micro),
    price_thb: Math.round(Number(pinned.price_micro) / 1_000_000),
    image_url: pinned.image_url,
    inventory: pinned.inventory,
    purchase_limit_per_user: limit,
    remaining_for_user: check.remaining,
    max_qty: limit > 0 ? Math.min(limit, pinned.inventory || limit) : pinned.inventory || 10,
    variant_id: variantId,
  };

  const msgId = await saveChatMessage(roomId, userId, userName, "order_draft", pinned.title, card);
  broadcastRoom(roomId, { type: "chat", message: { id: msgId, kind: "order_draft", body: pinned.title, payload: card, user_id: userId, user_name: userName } });
  broadcastRoom(roomId, { type: "order_draft", ...card, user_id: userId });

  return card;
}

app.get("/health", (_req, res) => {
  res.json({ ok: true, service: "live-commerce-svc", features: ["cf", "chat", "orders", "address", "slip-ocr"] });
});

app.get("/chat", (_req, res) => {
  res.sendFile(path.join(__dirname, "public", "chat.html"));
});

app.get("/merchant/orders", (_req, res) => {
  res.sendFile(path.join(__dirname, "public", "merchant-orders.html"));
});

/** Sync pinned products from live-token-service or direct POST */
app.post("/v1/live/pin", merchantAuth, async (req, res) => {
  const {
    room_id,
    merchant_id,
    slot = 1,
    product_id,
    external_id,
    title,
    price_micro,
    price_thb,
    image_url = "",
    inventory = 0,
    purchase_limit_per_user = 0,
  } = req.body || {};
  if (!room_id || !product_id) return res.status(400).json({ error: "room_id and product_id required" });

  const ext = external_id || product_id;
  const fCode = slot > 1 ? `F${slot}` : `F-${String(ext).slice(-8).toUpperCase()}`;
  const priceMicro = price_micro ?? (price_thb ? Number(price_thb) * 1_000_000 : 0);
  const id = ulid();

  await query(
    `INSERT INTO commerce.live_pinned_products
      (id, room_id, merchant_id, slot, f_code, product_id, external_id, title, price_micro, image_url, inventory, purchase_limit_per_user)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
     ON CONFLICT (room_id, slot) DO UPDATE SET
       f_code=EXCLUDED.f_code, product_id=EXCLUDED.product_id, external_id=EXCLUDED.external_id,
       title=EXCLUDED.title, price_micro=EXCLUDED.price_micro, image_url=EXCLUDED.image_url,
       inventory=EXCLUDED.inventory, purchase_limit_per_user=EXCLUDED.purchase_limit_per_user, pinned_at=NOW()`,
    [id, room_id, merchant_id || "merchant-demo", slot, fCode, product_id, ext, title || "สินค้าไลฟ์", priceMicro, image_url, inventory, purchase_limit_per_user],
  );

  const pinned = { f_code: fCode, slot, product_id, external_id: ext, title, price_micro: priceMicro, inventory, purchase_limit_per_user };
  broadcastRoom(room_id, { type: "pinned_update", pinned });
  res.json({ ok: true, pinned });
});

app.get("/v1/live/pinned", async (req, res) => {
  const roomId = req.query.room_id;
  if (!roomId) return res.status(400).json({ error: "room_id required" });
  const r = await query(
    `SELECT * FROM commerce.live_pinned_products WHERE room_id=$1 ORDER BY slot ASC`,
    [roomId],
  );
  res.json({ ok: true, room_id: roomId, pinned: r.rows });
});

app.get("/v1/live/chat/history", async (req, res) => {
  const roomId = req.query.room_id;
  if (!roomId) return res.status(400).json({ error: "room_id required" });
  const r = await query(
    `SELECT id, user_id, user_name, kind, body, payload, created_at
     FROM commerce.live_chat_messages WHERE room_id=$1 ORDER BY created_at ASC LIMIT 200`,
    [roomId],
  );
  res.json({ ok: true, messages: r.rows });
});

/** Confirm order draft -> flash buy */
app.post("/v1/live/order/confirm", async (req, res) => {
  const { draft_id, buyer_id, qty = 1 } = req.body || {};
  if (!draft_id || !buyer_id) return res.status(400).json({ error: "draft_id and buyer_id required" });

  const r = await query(`SELECT * FROM commerce.live_orders WHERE id=$1 AND buyer_id=$2`, [draft_id, buyer_id]);
  const draft = r.rows[0];
  if (!draft || draft.status !== "draft") return res.status(404).json({ error: "draft_not_found" });

  const meta = draft.metadata || {};
  const limit = meta.limit || 0;
  const check = await checkPurchaseLimit(draft.room_id, draft.product_id, buyer_id, qty, limit);
  if (!check.ok) {
    return res.status(422).json({ error: "purchase_limit_exceeded", remaining: check.remaining, limit: check.limit });
  }

  try {
    const order = await flashBuy({
      buyerId: buyer_id,
      variantId: draft.variant_id,
      productId: draft.product_id,
      merchantId: draft.merchant_id,
      qty,
      roomId: draft.room_id,
    });

    await incrementPurchaseCounter(draft.room_id, draft.product_id, buyer_id, qty);
    await query(
      `UPDATE commerce.live_orders SET status='confirmed', order_id=$2, qty=$3, updated_at=NOW() WHERE id=$1`,
      [draft_id, order.order_id, qty],
    );
    await query(
      `UPDATE commerce.orders SET live_room_id=$2, source='live_cf' WHERE id=$1`,
      [order.order_id, draft.room_id],
    ).catch(() => {});

    const successCard = {
      type: "order_success",
      draft_id,
      order_id: order.order_id,
      title: meta.title,
      qty,
      message: "สั่งซื้อสำเร็จ! กรุณากรอกที่อยู่จัดส่งด้านล่าง",
    };

    const msgId = await saveChatMessage(draft.room_id, buyer_id, draft.buyer_name, "order_success", successCard.message, successCard);
    broadcastRoom(draft.room_id, { type: "chat", message: { id: msgId, kind: "order_success", payload: successCard } });
    broadcastRoom(draft.room_id, { type: "order_success", ...successCard, user_id: buyer_id });

    // Push address form card
    const addresses = await listAddresses(buyer_id);
    const addrCard = { type: "address_form", order_id: order.order_id, draft_id, saved_addresses: addresses };
    const addrMsgId = await saveChatMessage(draft.room_id, "system", "AQOND", "address_form", "กรุณาเลือกหรือกรอกที่อยู่จัดส่ง", addrCard);
    broadcastRoom(draft.room_id, { type: "address_form", ...addrCard, message_id: addrMsgId });

    res.json({ ok: true, order_id: order.order_id, status: "confirmed" });
  } catch (e) {
    res.status(502).json({ error: "order_failed", detail: e.message });
  }
});

/** Submit shipping address for live order */
app.post("/v1/live/order/address", async (req, res) => {
  const { order_id, buyer_id, address_id, address, parse_text } = req.body || {};
  if (!order_id || !buyer_id) return res.status(400).json({ error: "order_id and buyer_id required" });

  let addrId = address_id;
  if (!addrId && parse_text) {
    const parsed = await aiParseAddress(parse_text);
    if (parsed) {
      const created = await createAddress({ owner_id: buyer_id, ...parsed, is_default: false });
      addrId = created.address_id;
    }
  }
  if (!addrId && address) {
    const created = await createAddress({ owner_id: buyer_id, ...address, is_default: address.is_default ?? false });
    addrId = created.address_id;
  }
  if (!addrId) return res.status(400).json({ error: "address required" });

  await attachShippingAddress(order_id, addrId);
  await query(
    `UPDATE commerce.live_orders SET shipping_address_id=$2, status='addressed', updated_at=NOW() WHERE order_id=$1`,
    [order_id, addrId],
  );

  const r = await query(`SELECT room_id FROM commerce.live_orders WHERE order_id=$1 LIMIT 1`, [order_id]);
  const roomId = r.rows[0]?.room_id;
  if (roomId) {
    const msg = "บันทึกที่อยู่จัดส่งเรียบร้อยแล้ว ร้านค้าจะจัดส่งให้เร็วๆ นี้";
    broadcastRoom(roomId, { type: "address_saved", order_id, address_id: addrId, message: msg });
  }

  res.json({ ok: true, order_id, address_id: addrId, message: "บันทึกที่อยู่จัดส่งเรียบร้อยแล้ว" });
});

/** Merchant: list live orders */
app.get("/v1/live/merchant/orders", merchantAuth, async (req, res) => {
  const { merchant_id, room_id, status } = req.query;
  if (!merchant_id) return res.status(400).json({ error: "merchant_id required" });

  let sql = `SELECT lo.*, o.fulfillment_status, o.amount_micro
             FROM commerce.live_orders lo
             LEFT JOIN commerce.orders o ON o.id = lo.order_id
             WHERE lo.merchant_id = $1`;
  const params = [merchant_id];
  if (room_id) {
    params.push(room_id);
    sql += ` AND lo.room_id = $${params.length}`;
  }
  if (status) {
    params.push(status);
    sql += ` AND lo.status = $${params.length}`;
  }
  sql += ` ORDER BY lo.created_at DESC LIMIT 100`;

  const r = await query(sql, params);
  res.json({ ok: true, orders: r.rows });
});

/** Merchant: confirm order + generate label */
app.post("/v1/live/merchant/confirm-ship", merchantAuth, async (req, res) => {
  const {
    order_id,
    merchant_id,
    carrier_id = "kerry-th",
    weight_grams = 500,
    show_carrier_header = true,
    label_template = "aqond",
  } = req.body || {};
  if (!order_id) return res.status(400).json({ error: "order_id required" });

  await updateFulfillment(order_id, "confirmed_by_seller", "ร้านยืนยันออเดอร์");

  const or = await query(`SELECT amount_micro, shipping_address_id FROM commerce.orders WHERE id=$1`, [order_id]);
  const order = or.rows[0];
  const lo = await query(`SELECT product_id, room_id, buyer_id FROM commerce.live_orders WHERE order_id=$1 LIMIT 1`, [order_id]);
  const live = lo.rows[0];

  const labelBody = {
    order_id,
    merchant_id: merchant_id || "merchant-demo",
    carrier_id,
    from_region: "TH",
    to_region: "TH",
    weight_grams,
    item_micro: order?.amount_micro || 0,
    product_id: live?.product_id || "",
    currency: "THB",
    show_carrier_header,
    label_template,
  };

  const { ok, data } = await createLabel(labelBody);
  if (ok) {
    await updateFulfillment(order_id, "label_generated", `tracking ${data.tracking_no}`);
  }

  res.json({ ok, label: data });
});

/** Merchant: upload shipping slip -> OCR -> notify buyer */
app.post("/v1/live/merchant/slip", merchantAuth, async (req, res) => {
  const { order_id, merchant_id, image_base64, slip_type = "shipping" } = req.body || {};
  if (!image_base64) return res.status(400).json({ error: "image_base64 required" });

  const ocr = await ocrSlip(image_base64);
  const slipId = ulid();

  await query(
    `INSERT INTO commerce.payment_slips (id, order_id, merchant_id, slip_type, ocr_json, tracking_no, amount_micro, verified)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
    [
      slipId,
      order_id || ocr.order_id,
      merchant_id || "merchant-demo",
      slip_type,
      JSON.stringify(ocr),
      ocr.tracking_no || null,
      ocr.amount_micro || null,
      !!(ocr.tracking_no || ocr.order_id),
    ],
  );

  if (order_id || ocr.order_id) {
    const oid = order_id || ocr.order_id;
    await updateFulfillment(oid, "shipped", `tracking ${ocr.tracking_no || ""}`);
    const lr = await query(`SELECT room_id, buyer_id FROM commerce.live_orders WHERE order_id=$1 LIMIT 1`, [oid]);
    const live = lr.rows[0];
    if (live?.room_id) {
      const msg = `จัดส่งแล้วครับ! เลขพัสดุ ${ocr.tracking_no || "—"} (${ocr.carrier || "ขนส่ง"})`;
      await saveChatMessage(live.room_id, "system", "AQOND", "shipment_notice", msg, { order_id: oid, ocr });
      broadcastRoom(live.room_id, { type: "shipment_notice", order_id: oid, message: msg, ocr });
    }
  }

  res.json({ ok: true, slip_id: slipId, ocr });
});

/** AI FAQ in live chat */
app.post("/v1/live/faq", async (req, res) => {
  const { room_id, user_message, product_context } = req.body || {};
  const reply = await aiFaqReply({ room_id, user_message, product_context });
  res.json({ ok: true, reply_th: reply || "สอบถามเพิ่มเติมได้เลยครับ" });
});

const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: "/ws" });

wss.on("connection", (ws, req) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const roomId = url.searchParams.get("room_id");
  const userId = url.searchParams.get("user_id") || `guest-${ulid().slice(0, 8)}`;
  const userName = url.searchParams.get("user_name") || userId;

  if (!roomId) {
    ws.close(4000, "room_id required");
    return;
  }

  if (!roomSockets.has(roomId)) roomSockets.set(roomId, new Set());
  roomSockets.get(roomId).add(ws);
  ws.roomId = roomId;
  ws.userId = userId;
  ws.userName = userName;

  ws.send(JSON.stringify({ type: "welcome", room_id: roomId, user_id: userId }));

  ws.on("message", async (raw) => {
    let msg;
    try {
      msg = JSON.parse(String(raw));
    } catch {
      return;
    }

    if (msg.type === "chat" && msg.text) {
      const id = await saveChatMessage(roomId, userId, userName, "text", msg.text, {});
      broadcastRoom(roomId, {
        type: "chat",
        message: { id, kind: "text", body: msg.text, user_id: userId, user_name: userName },
      });

      const fResult = await handleFCommand(roomId, userId, userName, msg.text);
      if (!fResult && !parseFCommand(msg.text)) {
        // Optional AI FAQ for non-F messages
        const faq = await aiFaqReply({ room_id: roomId, user_message: msg.text }).catch(() => null);
        if (faq) {
          const faqId = await saveChatMessage(roomId, "system", "AQOND", "faq", faq, {});
          broadcastRoom(roomId, { type: "chat", message: { id: faqId, kind: "faq", body: faq, user_name: "AQOND" } });
        }
      }
    }

    if (msg.type === "confirm_order" && msg.draft_id) {
      try {
        const r = await fetch(`http://127.0.0.1:${PORT}/v1/live/order/confirm`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ draft_id: msg.draft_id, buyer_id: userId, qty: msg.qty || 1 }),
        });
        const data = await r.json();
        ws.send(JSON.stringify({ type: "confirm_result", ...data }));
      } catch (e) {
        ws.send(JSON.stringify({ type: "error", message: e.message }));
      }
    }

    if (msg.type === "submit_address") {
      try {
        const r = await fetch(`http://127.0.0.1:${PORT}/v1/live/order/address`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...msg, buyer_id: userId }),
        });
        const data = await r.json();
        ws.send(JSON.stringify({ type: "address_result", ...data }));
      } catch (e) {
        ws.send(JSON.stringify({ type: "error", message: e.message }));
      }
    }
  });

  ws.on("close", () => {
    roomSockets.get(roomId)?.delete(ws);
  });
});

server.listen(PORT, () => {
  console.log(`live-commerce-svc :${PORT} (CF + chat + orders)`);
  getRedis().catch((e) => console.warn("redis optional:", e.message));
});
