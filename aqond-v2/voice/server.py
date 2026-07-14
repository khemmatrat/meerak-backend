"""
P5 Voice + Jarvis shopping concierge
STT/TTS: cpu-stub with Thai phrase simulation; GPU path via VOICE_MODEL=hertz-gpu
"""
import asyncio
import json
import os
import re
from pathlib import Path

import aiohttp
from aiohttp import web

VOICE_MODEL = os.environ.get("VOICE_MODEL", "cpu-stub")
PORT = int(os.environ.get("PORT", "8090"))
AI_CORE_URL = os.environ.get("AI_CORE_URL", "http://ai-core:8100").rstrip("/")
AI_CORE_KEY = os.environ.get("AI_CORE_API_KEY", "")
MARKETPLACE_URL = os.environ.get("MARKETPLACE_URL", "http://marketplace-web:8080").rstrip("/")
ORDER_URL = os.environ.get("ORDER_SERVICE_URL", "http://order-svc:8113").rstrip("/")
SEARCH_URL = os.environ.get("SEARCH_SERVICE_URL", "http://search-svc:8122").rstrip("/")
PUBLIC_DIR = Path(__file__).parent / "public"

_sessions: dict[str, dict] = {}


def stt_stub(audio_bytes: int, hint: str = "") -> str:
    """CPU STT stub — Thai phrase simulation for dev; GPU path replaces with Whisper."""
    if hint:
        return hint.strip()
    if audio_bytes <= 0:
        return ""
    # Deterministic demo transcript from payload size (dev smoke / WS binary ack flow)
    phrases = [
        "รับของแล้ว",
        "ถึงแล้ว",
        "ส่งสำเร็จ",
        "หา matcha",
        "ออเดอร์อยู่ไหน",
    ]
    return phrases[audio_bytes % len(phrases)]


def tts_stub(text: str) -> dict:
    """CPU TTS stub — client plays text; GPU returns audio URL later."""
    return {"type": "tts_stub", "text": text, "audio_url": None}


async def fetch_product(external_id: str) -> dict | None:
    url = f"{MARKETPLACE_URL}/products/{external_id}"
    timeout = aiohttp.ClientTimeout(total=15)
    async with aiohttp.ClientSession(timeout=timeout) as session:
        async with session.get(url) as resp:
            data = await resp.json()
            if resp.status != 200:
                return None
            return data.get("product")


async def call_ai(path: str, payload: dict) -> dict:
    headers = {"Content-Type": "application/json"}
    if AI_CORE_KEY:
        headers["X-AI-Core-Api-Key"] = AI_CORE_KEY
    timeout = aiohttp.ClientTimeout(total=300)
    async with aiohttp.ClientSession(timeout=timeout) as session:
        async with session.post(f"{AI_CORE_URL}{path}", json=payload, headers=headers) as resp:
            data = await resp.json()
            if resp.status != 200:
                raise RuntimeError(data.get("error") or f"ai_{resp.status}")
            return data


async def call_live_closer(context: dict) -> dict:
    data = await call_ai("/v1/live/closer", context)
    return data.get("closer") or data


async def call_jarvis(context: dict) -> dict:
    return await call_ai("/v1/jarvis/concierge", context)


async def search_products(query: str) -> list:
    timeout = aiohttp.ClientTimeout(total=15)
    async with aiohttp.ClientSession(timeout=timeout) as session:
        async with session.get(f"{SEARCH_URL}/v1/search", params={"q": query, "tab": "product", "limit": 8}) as resp:
            data = await resp.json()
            return data.get("results") or data.get("items") or []


async def flash_buy(variant_id: str, product_id: str, merchant_id: str, buyer_id: str, qty: int = 1) -> dict:
    headers = {"Content-Type": "application/json", "Idempotency-Key": f"jarvis-{buyer_id}-{variant_id}-{qty}"}
    body = {
        "buyer_id": buyer_id,
        "variant_id": variant_id,
        "product_id": product_id,
        "merchant_id": merchant_id or "merchant-demo",
        "qty": qty,
    }
    timeout = aiohttp.ClientTimeout(total=30)
    async with aiohttp.ClientSession(timeout=timeout) as session:
        async with session.post(f"{ORDER_URL}/v1/flash/buy", json=body, headers=headers) as resp:
            data = await resp.json()
            if resp.status not in (200, 202):
                raise RuntimeError(data.get("error") or f"order_{resp.status}")
            return data


async def create_checkout(external_id: str, buyer_id: str) -> dict:
    timeout = aiohttp.ClientTimeout(total=30)
    async with aiohttp.ClientSession(timeout=timeout) as session:
        async with session.post(
            f"{MARKETPLACE_URL}/checkout",
            json={"external_id": external_id, "buyer_id": buyer_id, "qty": 1},
        ) as resp:
            data = await resp.json()
            if resp.status not in (200, 201):
                raise RuntimeError(data.get("error") or f"checkout_{resp.status}")
            return data


async def execute_jarvis_tools(session_id: str, jarvis: dict, ws: web.WebSocketResponse) -> dict:
    state = _sessions.get(session_id, {})
    session = state.get("session") or {}
    action = jarvis.get("action")

    if action == "search" and jarvis.get("search_query"):
        products = await search_products(jarvis["search_query"])
        session["last_search"] = products
        await ws.send_json({"type": "products", "products": products[:5]})
        if products:
            p = products[0]
            price = round((p.get("price_micro") or 0) / 1_000_000)
            jarvis["reply_th"] = f"พบ {len(products)} ร้านครับเจ้านาย ตัวแรก {p.get('title','สินค้า')} ราคา {price} บาท"
            session["selected_product_id"] = p.get("product_id") or p.get("id")

    if action == "compare" and session.get("last_search"):
        items = sorted(session["last_search"], key=lambda x: x.get("price_micro") or 0)
        if items:
            cheap = items[0]
            expensive = items[-1]
            cp = round((cheap.get("price_micro") or 0) / 1_000_000)
            ep = round((expensive.get("price_micro") or 0) / 1_000_000)
            jarvis["reply_th"] = f"ราคาที่ถูกที่สุดตอนนี้ {cp} บาท คุณภาพดีและเป็นสินค้าเดียวกันกับราคา {ep} บาทครับเจ้านาย สั่งซื้อเลยไหมครับ"
            session["selected_product_id"] = cheap.get("product_id") or cheap.get("id")
            await ws.send_json({"type": "compare", "cheapest": cheap, "compare": items[:5]})

    if action == "select_variant":
        val = jarvis.get("selected_variant_value") or ""
        session["selected_variant_value"] = val
        jarvis["reply_th"] = f"เลือกตัวเลือก{val}ให้เจ้านายแล้วครับ สั่งซื้อเลยไหมครับ"

    if jarvis.get("should_place_order") or action == "place_order":
        pid = jarvis.get("selected_product_id") or session.get("selected_product_id")
        if pid:
            try:
                variants = []
                product = await fetch_product(pid)
                vid = pid
                if product:
                    vid = product.get("variant_id") or pid
                order = await flash_buy(vid, pid, "merchant-demo", f"jarvis-{session_id[:12]}", jarvis.get("qty") or 1)
                jarvis["reply_th"] = "สั่งซื้อสำเร็จแล้วเจ้านาย รอทางร้านกดรับยืนยันสินค้าเพื่อทำการจัดส่งครับ"
                await ws.send_json({"type": "order_success", "order": order})
            except Exception as e:
                jarvis["reply_th"] = f"ขออภัยครับเจ้านาย สั่งซื้อไม่สำเร็จ: {e}"

    state["session"] = session
    _sessions[session_id] = state
    return jarvis


async def process_jarvis_message(session_id: str, text: str, ws: web.WebSocketResponse) -> None:
    state = _sessions.get(session_id, {})
    session = state.get("session") or {}
    ctx = {"session_id": session_id, "user_message": text, "session": session}

    await ws.send_json({"type": "thinking", "text": "รอสักครู่ครับเจ้านาย..."})

    task = asyncio.create_task(call_jarvis(ctx))
    state["task"] = task
    _sessions[session_id] = state

    try:
        result = await task
        jarvis = result.get("jarvis") or result
        jarvis = await execute_jarvis_tools(session_id, jarvis, ws)
    except asyncio.CancelledError:
        await ws.send_json({"type": "interrupted", "session_id": session_id})
        return
    except Exception as e:
        await ws.send_json({"type": "error", "message": str(e), "session_id": session_id})
        return
    finally:
        state.pop("task", None)

    reply = jarvis.get("reply_th", "")
    await ws.send_json({
        "type": "jarvis_reply",
        "session_id": session_id,
        "text": reply,
        "jarvis": jarvis,
        "tts": tts_stub(reply),
        "model": VOICE_MODEL,
    })


async def process_user_message(session_id: str, text: str, ws: web.WebSocketResponse) -> None:
    state = _sessions.get(session_id, {})
    mode = state.get("mode", "closer")
    if mode == "jarvis":
        await process_jarvis_message(session_id, text, ws)
        return

    ctx = dict(state.get("context") or {})
    ctx["user_message"] = text
    ctx["session_id"] = session_id

    task = asyncio.create_task(call_live_closer(ctx))
    state["task"] = task
    _sessions[session_id] = state

    try:
        closer = await task
    except asyncio.CancelledError:
        await ws.send_json({"type": "interrupted", "session_id": session_id})
        return
    except Exception as e:
        await ws.send_json({"type": "error", "message": str(e), "session_id": session_id})
        return
    finally:
        state.pop("task", None)

    payload = {
        "type": "reply",
        "session_id": session_id,
        "text": closer.get("reply_th", ""),
        "closer": closer,
        "tts": tts_stub(closer.get("reply_th", "")),
        "model": VOICE_MODEL,
    }

    if closer.get("should_create_order") and closer.get("product_id"):
        ext = closer["product_id"]
        try:
            order = await create_checkout(ext, f"voice-{session_id[:12]}")
            payload["order"] = {
                "order_id": order.get("order", {}).get("order_id"),
                "amount_thb": order.get("amount_thb"),
                "escrow_status": order.get("escrow", {}).get("status"),
            }
        except Exception as e:
            payload["checkout_error"] = str(e)

    await ws.send_json(payload)


async def health(_request):
    return web.json_response({
        "ok": True,
        "service": "voice-service",
        "model": VOICE_MODEL,
        "p5": {"live_closer": True, "jarvis": True, "websocket": "/ws", "ui": "/closer"},
        "ai_core": AI_CORE_URL,
    })


async def closer_page(_request):
    return web.FileResponse(PUBLIC_DIR / "closer.html")


async def jarvis_page(_request):
    jarvis_html = PUBLIC_DIR / "jarvis.html"
    if jarvis_html.exists():
        return web.FileResponse(jarvis_html)
    return web.json_response({"ui": "/ws", "mode": "jarvis", "hint": "send start with mode=jarvis"})


async def closer_text(request):
    body = await request.json()
    session_id = body.get("session_id") or "rest-smoke"
    text = body.get("text") or body.get("user_message") or ""
    external_id = body.get("external_id")
    ctx = {"session_id": session_id, "user_message": text}
    if external_id:
        product = await fetch_product(external_id)
        if product:
            ctx.update({
                "external_id": external_id,
                "title": product.get("title"),
                "price_thb": product.get("price_thb") or product.get("price"),
                "inventory": product.get("inventory"),
            })
    closer = await call_live_closer(ctx)
    result = {"ok": True, "closer": closer}
    if closer.get("should_create_order") and closer.get("product_id"):
        try:
            result["checkout"] = await create_checkout(closer["product_id"], f"voice-{session_id[:12]}")
        except Exception as e:
            result["checkout_error"] = str(e)
    return web.json_response(result)


async def jarvis_text(request):
    body = await request.json()
    session_id = body.get("session_id") or "jarvis-rest"
    text = body.get("text") or body.get("user_message") or ""
    ctx = {"session_id": session_id, "user_message": text, "session": body.get("session") or {}}
    result = await call_jarvis(ctx)
    return web.json_response(result)


async def ws_handler(request):
    ws = web.WebSocketResponse(heartbeat=20)
    await ws.prepare(request)
    session_id = None

    async for msg in ws:
        if msg.type == web.WSMsgType.BINARY:
            transcript = stt_stub(len(msg.data))
            if transcript:
                await process_user_message(session_id or "ws", transcript, ws)
            else:
                await ws.send_json({
                    "type": "audio_ack",
                    "bytes": len(msg.data),
                    "note": "STT stub — send type:text or speak-to-text on client",
                })
            continue
        if msg.type != web.WSMsgType.TEXT:
            continue

        try:
            data = json.loads(msg.data)
        except json.JSONDecodeError:
            await ws.send_json({"type": "error", "message": "invalid_json"})
            continue

        msg_type = data.get("type")

        if msg_type == "start":
            session_id = data.get("session_id") or f"s-{id(ws)}"
            mode = data.get("mode", "closer")
            ctx = {"session_id": session_id, "room_name": data.get("room_name")}
            external_id = data.get("external_id") or data.get("product_id")
            if external_id:
                product = await fetch_product(external_id)
                if product:
                    ctx.update({
                        "external_id": external_id,
                        "title": product.get("title"),
                        "price_thb": product.get("price_thb") or product.get("price"),
                        "inventory": product.get("inventory"),
                    })
            _sessions[session_id] = {"context": ctx, "mode": mode, "session": {}}
            greeting = "สวัสดีครับเจ้านาย มีอะไรให้ช่วยไหมครับ" if mode == "jarvis" else "สวัสดีครับ สนใจสินค้าไหมครับ"
            await ws.send_json({"type": "ready", "session_id": session_id, "mode": mode, "greeting": greeting, "context": ctx})

        elif msg_type == "interrupt":
            sid = data.get("session_id") or session_id
            st = _sessions.get(sid or "")
            if st and st.get("task") and not st["task"].done():
                st["task"].cancel()
            await ws.send_json({"type": "interrupted", "session_id": sid})

        elif msg_type == "text":
            sid = data.get("session_id") or session_id
            if not sid:
                await ws.send_json({"type": "error", "message": "send start first"})
                continue
            if sid in _sessions and data.get("external_id"):
                _sessions[sid]["context"]["external_id"] = data["external_id"]
            if data.get("mode"):
                _sessions[sid]["mode"] = data["mode"]
            await process_user_message(sid, data.get("text", ""), ws)

    return ws


def assert_prod_secrets() -> None:
    if os.environ.get("AQOND_ENV", "").lower() != "production":
        return
    key = os.environ.get("AI_CORE_API_KEY", "")
    weak = not key or len(key) < 16 or "CHANGE_ME" in key
    if weak:
        print("[FATAL] AQOND_ENV=production — rotate AI_CORE_API_KEY", flush=True)
        raise SystemExit(1)


def main():
    assert_prod_secrets()
    app = web.Application()
    app.router.add_get("/health", health)
    app.router.add_get("/", health)
    app.router.add_get("/closer", closer_page)
    app.router.add_get("/jarvis", jarvis_page)
    app.router.add_post("/closer/text", closer_text)
    app.router.add_post("/jarvis/text", jarvis_text)
    app.router.add_get("/ws", ws_handler)
    web.run_app(app, host="0.0.0.0", port=PORT)


if __name__ == "__main__":
    main()
