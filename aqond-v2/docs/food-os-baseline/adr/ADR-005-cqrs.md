# ADR-005: CQRS for Operational vs Governance Data

**Status:** Accepted  
**Date:** 2026-07-17

## Decision

Food OS uses **CQRS separation**:

- **Write side:** Commands via APIs (`fulfillment`, `verify-pickup`, `settle`, etc.) emit events
- **Read side:** Track OS projection, SSE streams, admin dashboards

FairPlay will add a second read model (trust profile) from the same event stream.

## Rationale

- Read models optimized per consumer (Track OS vs trust scoring)
- Replay rebuilds projections without mutating command handlers
- Scales independent read paths

## Consequences

- UI never writes business state except through command APIs
- Projections are disposable/rebuildable
- Idempotent consumers required

## Alternatives rejected

- Single normalized DB table for all UI fields (rejected: coupling, slow evolution)
- Event sourcing entire order aggregate (deferred: complexity vs need)
