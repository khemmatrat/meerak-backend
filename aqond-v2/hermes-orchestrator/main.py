"""P16-P22 Hermes orchestrator — tool-calling bridge, memory, live consultant, scheduling."""
from __future__ import annotations

import asyncio
import json
import logging
import os
import uuid
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from typing import Any

import httpx
import redis.asyncio as redis
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from fastapi import Depends, FastAPI, Header, HTTPException
from pydantic import BaseModel, Field

LOG = logging.getLogger("hermes-orchestrator")
logging.basicConfig(level=logging.INFO)

AI_CORE_URL = os.environ.get("AI_CORE_URL", "http://ai-core:8100").rstrip("/")
AI_CORE_KEY = os.environ.get("AI_CORE_API_KEY", "")
CATALOG_URL = os.environ.get("CATALOG_SERVICE_URL", "http://catalog-svc:8110").rstrip("/")
ORDER_URL = os.environ.get("ORDER_SERVICE_URL", "http://order-svc:8113").rstrip("/")
REDIS_URL = os.environ.get("REDIS_URL", "redis://aqond-redis:6379/1")
PG_DSN = (
    f"postgresql://{os.environ.get('PGUSER', 'admin_boss')}:"
    f"{os.environ.get('PGPASSWORD', '')}@"
    f"{os.environ.get('PGHOST', 'aqond-db')}:"
    f"{os.environ.get('PGPORT', '5432')}/"
    f"{os.environ.get('PGDATABASE', 'commerce')}"
)
KAFKA_BROKERS = os.environ.get("KAFKA_BROKERS", "redpanda:9092")
HERMES_API_KEY = os.environ.get("HERMES_API_KEY", os.environ.get("AI_CORE_API_KEY", ""))
USE_RULES_ONLY = os.environ.get("HERMES_USE_RULES_ONLY", "1") == "1"
MAX_DAILY_INFERENCES = int(os.environ.get("HERMES_MAX_DAILY_INFERENCES", "500"))

redis_client: redis.Redis | None = None
scheduler = AsyncIOScheduler()
daily_inference_count = 0


class MemoryWrite(BaseModel):
    merchant_id: str
    session_id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    content: str
    layer: str = "episodic"


class ListingOptimizeRequest(BaseModel):
    merchant_id: str
    product_id: str
    title: str
    description: str = ""
    category: str = "general"


class LiveConsultRequest(BaseModel):
    merchant_id: str
    room_name: str
    chat_messages: list[str] = []
    retention_pct: float = 0.0
    checkout_dropoff_pct: float = 0.0


class ToolCallRequest(BaseModel):
    merchant_id: str
    tool: str
    arguments: dict[str, Any] = {}


async def verify_key(x_hermes_api_key: str | None = Header(default=None, alias="X-Hermes-Api-Key")):
    if HERMES_API_KEY and x_hermes_api_key != HERMES_API_KEY:
        raise HTTPException(401, "unauthorized")


async def ai_core_post(path: str, payload: dict) -> dict:
    headers = {"Content-Type": "application/json"}
    if AI_CORE_KEY:
        headers["X-AI-Core-Api-Key"] = AI_CORE_KEY
    async with httpx.AsyncClient(timeout=120.0) as client:
        r = await client.post(f"{AI_CORE_URL}{path}", json=payload, headers=headers)
        r.raise_for_status()
        return r.json()


def guardrails_ok() -> bool:
    global daily_inference_count
    if daily_inference_count >= MAX_DAILY_INFERENCES:
        return False
    daily_inference_count += 1
    return True


async def working_memory_get(merchant_id: str) -> dict:
    if not redis_client:
        return {}
    raw = await redis_client.get(f"hermes:working:{merchant_id}")
    return json.loads(raw) if raw else {}


async def working_memory_set(merchant_id: str, data: dict) -> None:
    if redis_client:
        await redis_client.setex(f"hermes:working:{merchant_id}", 3600, json.dumps(data))


async def episodic_store(merchant_id: str, session_id: str, content: str) -> None:
    try:
        import asyncpg
        conn = await asyncpg.connect(PG_DSN)
        await conn.execute(
            """INSERT INTO commerce.hermes_episodic_memory (id, merchant_id, shard_key, session_id, content)
               VALUES ($1,$2,$3,$4,$5)""",
            str(uuid.uuid4()), merchant_id, merchant_id, session_id, content,
        )
        await conn.close()
    except Exception as e:
        LOG.warning("episodic_store failed: %s", e)


async def fetch_merchant_orders(merchant_id: str, status: str = "pending", limit: int = 10) -> list[dict]:
    """Lookup orders via order-svc; falls back to PG when service unavailable."""
    try:
        async with httpx.AsyncClient(timeout=12.0) as client:
            r = await client.get(
                f"{ORDER_URL}/v1/orders/merchant",
                params={"merchant_id": merchant_id, "limit": limit},
                headers={"X-Aqond-Region": "TH"},
            )
            if r.status_code == 200:
                data = r.json()
                orders = data.get("orders") or []
                if status and status != "all":
                    orders = [
                        o for o in orders
                        if o.get("fulfillment_status") == status
                        or (status == "pending" and o.get("fulfillment_status") in ("pending_accept", "accepted", "preparing"))
                    ]
                return orders[:limit]
    except Exception as e:
        LOG.warning("order_lookup http failed: %s", e)
    try:
        import asyncpg
        conn = await asyncpg.connect(PG_DSN)
        rows = await conn.fetch(
            """SELECT id AS order_id, fulfillment_status, status, amount_micro, created_at
               FROM commerce.orders
               WHERE merchant_id=$1 AND status NOT IN ('rejected','cancelled')
               ORDER BY created_at DESC LIMIT $2""",
            merchant_id, limit,
        )
        await conn.close()
        return [dict(r) for r in rows]
    except Exception as e:
        LOG.warning("order_lookup pg failed: %s", e)
        return []


async def notify_from_order_event(ev: dict, topic: str) -> None:
    """Event-driven hints for merchant working memory after order phase changes."""
    merchant = ev.get("merchant_id") or ev.get("shard_key")
    if not merchant:
        return
    wm = await working_memory_get(merchant)
    phase = ev.get("fulfillment_status") or ev.get("phase") or ev.get("status") or ""
    wm["last_order_event"] = {
        "topic": topic,
        "order_id": ev.get("order_id") or ev.get("id"),
        "phase": phase,
        "at": datetime.now(timezone.utc).isoformat(),
    }
    if phase in ("pending_accept", "accepted"):
        wm["pending_sla_hint"] = "ตอบออเดอร์ภายใน 5 นาที"
    elif phase in ("preparing", "ready"):
        wm["dispatch_hint"] = "ไรเดอร์จะมารับเมื่อสถานะพร้อมส่ง"
    await working_memory_set(merchant, wm)


async def procedural_get(merchant_id: str, rule_key: str) -> dict | None:
    try:
        import asyncpg
        conn = await asyncpg.connect(PG_DSN)
        row = await conn.fetchrow(
            "SELECT rule_value FROM commerce.hermes_procedural_rules WHERE merchant_id=$1 AND rule_key=$2",
            merchant_id, rule_key,
        )
        await conn.close()
        return json.loads(row["rule_value"]) if row else None
    except Exception:
        return None


async def kafka_consumer_loop():
    try:
        from aiokafka import AIOKafkaConsumer
    except ImportError:
        LOG.warning("aiokafka unavailable — kafka consumer disabled")
        return
    consumer = AIOKafkaConsumer(
        "catalog.product.updated", "orders.confirmed", "orders.rejected",
        bootstrap_servers=KAFKA_BROKERS, group_id="hermes-orchestrator",
        auto_offset_reset="latest",
    )
    await consumer.start()
    LOG.info("hermes kafka consumer started")
    try:
        async for msg in consumer:
            try:
                ev = json.loads(msg.value.decode())
                merchant = ev.get("merchant_id") or ev.get("shard_key") or "unknown"
                wm = await working_memory_get(merchant)
                wm["last_event"] = {"topic": msg.topic, "at": datetime.now(timezone.utc).isoformat()}
                await working_memory_set(merchant, wm)
                if msg.topic.startswith("orders."):
                    await notify_from_order_event(ev, msg.topic)
            except Exception as e:
                LOG.warning("event handle error: %s", e)
    finally:
        await consumer.stop()


async def weekly_audit_job():
    LOG.info("P20 weekly audit job tick — placeholder for merchant performance reports")


@asynccontextmanager
async def lifespan(app: FastAPI):
    global redis_client
    redis_client = redis.from_url(REDIS_URL, decode_responses=True)
    scheduler.add_job(weekly_audit_job, "cron", day_of_week="mon", hour=3)
    scheduler.start()
    task = asyncio.create_task(kafka_consumer_loop())
    yield
    task.cancel()
    scheduler.shutdown()
    if redis_client:
        await redis_client.aclose()


app = FastAPI(title="Hermes Orchestrator", lifespan=lifespan)


@app.get("/health")
async def health():
    return {
        "ok": True,
        "service": "hermes-orchestrator",
        "p16": True, "p17": True, "p18": True, "p19": True, "p20": True,
        "rules_only": USE_RULES_ONLY,
        "guardrails": {"max_daily_inferences": MAX_DAILY_INFERENCES, "used": daily_inference_count},
    }


@app.post("/v1/memory")
async def write_memory(body: MemoryWrite, _: None = Depends(verify_key)):
    if body.layer == "working":
        wm = await working_memory_get(body.merchant_id)
        wm.setdefault("notes", []).append(body.content)
        await working_memory_set(body.merchant_id, wm)
    elif body.layer == "episodic":
        await episodic_store(body.merchant_id, body.session_id, body.content)
    elif body.layer == "procedural":
        import asyncpg
        conn = await asyncpg.connect(PG_DSN)
        await conn.execute(
            """INSERT INTO commerce.hermes_procedural_rules (id, merchant_id, shard_key, rule_key, rule_value)
               VALUES ($1,$2,$3,$4,$5::jsonb)
               ON CONFLICT (merchant_id, rule_key) DO UPDATE SET rule_value=EXCLUDED.rule_value, updated_at=NOW()""",
            str(uuid.uuid4()), body.merchant_id, body.merchant_id, body.content[:64],
            json.dumps({"rule": body.content}),
        )
        await conn.close()
    return {"ok": True, "layer": body.layer}


@app.get("/v1/memory/{merchant_id}")
async def read_memory(merchant_id: str, _: None = Depends(verify_key)):
    wm = await working_memory_get(merchant_id)
    proc = await procedural_get(merchant_id, "default_strategy")
    return {"merchant_id": merchant_id, "working": wm, "procedural_default": proc}


@app.post("/v1/tools/call")
async def tool_call(body: ToolCallRequest, _: None = Depends(verify_key)):
    if not guardrails_ok():
        raise HTTPException(429, "daily_inference_limit")
    wm = await working_memory_get(body.merchant_id)
    args = body.arguments or {}
    if body.tool == "optimize_listing":
        return await optimize_listing(ListingOptimizeRequest(
            merchant_id=body.merchant_id,
            product_id=args.get("product_id", ""),
            title=args.get("title", ""),
            description=args.get("description", ""),
        ))
    if body.tool == "live_consult":
        return await live_consult(LiveConsultRequest(
            merchant_id=body.merchant_id,
            room_name=args.get("room_name", ""),
            chat_messages=args.get("chat_messages", []),
        ))
    if body.tool == "order_lookup":
        status = args.get("status", "pending")
        limit = int(args.get("limit", 10))
        orders = await fetch_merchant_orders(body.merchant_id, status=status, limit=limit)
        await working_memory_set(body.merchant_id, {**wm, "last_order_lookup": len(orders)})
        return {"ok": True, "orders": orders, "count": len(orders), "hint": status, "source": "order-svc"}
    if body.tool == "merchant_sla_hint":
        tips = [
            "ตอบออเดอร์ภายใน 5 นาที — คะแนนร้านดีขึ้น",
            "กดเตรียมอาหารทันทีเมื่อรับออเดอร์",
            "ปิดของหมดเมนูที่หมด — ลูกค้าไม่สั่งผิด",
        ]
        script = tips[0] if args.get("urgent") else " | ".join(tips[:2])
        await working_memory_set(body.merchant_id, {**wm, "last_sla_hint": script})
        return {"ok": True, "tips": tips, "script": script, "source": "rules"}
    if body.tool == "menu_promo_hint":
        return {
            "ok": True,
            "suggestions": [
                "สร้างโปร 10% สำหรับเมนูขายดี",
                "ปักหมุดสินค้าในไลฟ์พร้อม F-Code",
            ],
            "source": "rules",
        }
    if body.tool == "rider_phase_hint":
        phase = args.get("phase", "rider_assigned")
        labels = {
            "rider_assigned": "ไปรับที่ร้าน",
            "rider_picked_up": "รับของแล้ว — ออกเดินทาง",
            "en_route": "กำลังนำไปส่ง",
            "arrived": "ถึงที่หมายแล้ว",
        }
        return {"ok": True, "phase": phase, "label": labels.get(phase, phase), "source": "rules"}
    return {"ok": False, "error": "unknown_tool", "known_tools": [
        "optimize_listing", "live_consult", "order_lookup", "merchant_sla_hint",
        "menu_promo_hint", "rider_phase_hint",
    ], "working_context": wm}


@app.post("/v1/listing/optimize")
async def optimize_listing(body: ListingOptimizeRequest, _: None = Depends(verify_key)):
    if not guardrails_ok():
        raise HTTPException(429, "daily_inference_limit")
    if USE_RULES_ONLY:
        tags = [body.category, "live-sale", "th"]
        optimized = {
            "title": body.title[:80],
            "description": body.description or f"{body.title} — สินค้าคุณภาพ จัดส่งเร็ว",
            "seo_tags": tags,
            "score": 0.72,
            "source": "rules",
        }
    else:
        data = await ai_core_post("/v1/onboard/product", {
            "merchant_hint": body.title,
            "llm_output": {"title": body.title, "description": body.description, "category": body.category},
        })
        optimized = {"title": data.get("product", {}).get("title"), "source": "hermes", "score": 0.85}
    await episodic_store(body.merchant_id, "listing", json.dumps(optimized))
    return {"ok": True, "optimized": optimized}


@app.post("/v1/live/consult")
async def live_consult(body: LiveConsultRequest, _: None = Depends(verify_key)):
    if not guardrails_ok():
        raise HTTPException(429, "daily_inference_limit")
    suggestions = []
    if body.checkout_dropoff_pct > 0.3:
        suggestions.append("ลดราคา flash 5-10% ใน 10 นาทีถัดไป")
    if body.retention_pct < 0.5:
        suggestions.append("ถามคำถาม engagement: ชอบสีไหน? กดหัวใจถ้าชอบ!")
    if not suggestions:
        suggestions.append("แนะนำสินค้าถัดไปพร้อม F-Code")
    script = " | ".join(suggestions)
    if not USE_RULES_ONLY and body.chat_messages:
        try:
            data = await ai_core_post("/v1/live/closer", {
                "external_id": body.room_name,
                "messages": body.chat_messages[-5:],
                "context": {"merchant_id": body.merchant_id},
            })
            script = data.get("closer", {}).get("reply", script)
        except Exception as e:
            LOG.warning("live closer fallback: %s", e)
    await working_memory_set(body.merchant_id, {"last_live_room": body.room_name, "last_script": script})
    return {"ok": True, "suggestions": suggestions, "script": script}


@app.post("/v1/schedule/audit")
async def trigger_audit(merchant_id: str, _: None = Depends(verify_key)):
    report = {
        "merchant_id": merchant_id,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "summary": "Weekly performance audit (P20)",
        "recommendations": ["เพิ่ม live 2 ครั้ง/สัปดาห์", "ปรับราคา competitor -3%"],
    }
    await episodic_store(merchant_id, "audit", json.dumps(report))
    return {"ok": True, "report": report}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=int(os.environ.get("PORT", "8120")))
