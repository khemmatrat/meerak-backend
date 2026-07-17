# EVENT_VERSIONING_POLICY

**Applies to:** `AqondEventType` catalog and all downstream consumers (including FairPlay)

---

## Principles

1. Events are **immutable facts** — never rewrite history
2. Schema evolves **forward only** via version field
3. Consumers must tolerate unknown fields (JSON extensibility)
4. Producers must not remove required fields without version bump

---

## Version field

All events carry implicit **v1** at baseline. Future envelope:

```json
{
  "event_version": 1,
  "schema": "order.customer_confirmed",
  ...
}
```

| Version | Status | Rule |
|---------|--------|------|
| v1 | **current** | Baseline catalog (30 types) |
| v2+ | planned | Additive payload only within same `event_type` |
| deprecated | sunset | Producer stops emit; consumer reads historical |

---

## Compatibility matrix

| Producer ↓ / Consumer → | v1 consumer | v2 consumer |
|-------------------------|-------------|-------------|
| v1 producer | ✅ | ✅ (ignore new fields) |
| v2 producer (additive) | ✅ | ✅ |
| v2 producer (breaking) | ❌ | ✅ |

**Breaking** = remove field, change type, change semantic meaning.

---

## Adding a new event type

1. Add to `lifecycleEventTypes.ts` + `EVENT_CATALOG_v1.md` (or v2 doc)
2. ADR entry
3. Emitter in single server module
4. Track OS projection handler (read)
5. Outbox enqueue (automatic via `appendAqondEvent`)
6. Update FairPlay consumption contract if subscribed
7. Integration test

---

## Deprecating an event type

1. Mark `deprecated: true` in catalog with sunset date
2. Stop new emits (feature flag)
3. Consumer continues replay for retention period (min 24 months financial, 12 months ops)
4. Never delete rows from `order_lifecycle_events`

---

## Migration strategy (consumer)

| Strategy | When |
|----------|------|
| **Idempotent replay** | Rebuild projection from offset 0 |
| **Dual-read** | During v1→v2 transition, accept both shapes |
| **Offset checkpoint** | `fairplay.consumer_offsets` per partition |
| **DLQ** | Schema validation failure → manual fix |

---

## Event evolution (2–3 year horizon)

Expect 100+ event types across AQOND domains. Rules:

- Namespace by domain: `order.*`, `claim.*`, `fairplay.*`, `payment.*`
- Max one semantic meaning per `event_type` string
- Use `payload.subtype` for variants instead of proliferating top-level types when possible
- Quarterly catalog audit

---

## FairPlay-specific

FairPlay may subscribe only to types in [EVENT_CATALOG_v1.md](./EVENT_CATALOG_v1.md).  
New subscriptions require FairPlay policy version bump, not Food OS workflow change.
