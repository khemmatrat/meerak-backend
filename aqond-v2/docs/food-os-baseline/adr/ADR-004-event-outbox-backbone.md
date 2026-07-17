# ADR-004: Event Backbone Uses Transactional Outbox

**Status:** Accepted  
**Date:** 2026-07-17

## Decision

Every lifecycle transition appends to `appendAqondEvent` which enqueues an **outbox entry** with idempotency key `{order_id}:{event_type}:{id}`. Production uses PG tables `event_outbox` + `event_dlq`; dev uses JSON mirror.

## Rationale

- At-least-once delivery to downstream consumers (FairPlay, notify, analytics)
- Replay and DLQ recovery for failed projections
- Auditability — no hidden state changes

## Consequences

- Admin replay API: `POST /api/admin/events/replay`
- Worker: `workers/lifecycleProjector.mjs`
- Metrics: `GET /api/admin/events/metrics`
- `FOOD_EVENT_BACKBONE=pg` in production

## Alternatives rejected

- Fire-and-forget HTTP callbacks (rejected: no durability)
- Dual-write without outbox (rejected: inconsistency under failure)
