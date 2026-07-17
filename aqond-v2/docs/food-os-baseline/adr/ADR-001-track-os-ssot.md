# ADR-001: Track OS is the Single Source of Truth

**Status:** Accepted  
**Date:** 2026-07-17  
**Context:** Food Delivery OS v1.0.0 baseline

## Decision

All operational truth for an order (parties, timeline, proofs, chats, dispatch, claims, review, GPS) is assembled in **one read-only projection**: `trackOsProjection.ts`, exposed via admin BFF and customer track APIs.

## Rationale

- Eliminates fragmented state across merchant, rider, and admin modules
- Admin UI and customer UI are **views** — no business rules in widgets
- FairPlay and analytics consume the same event stream, not UI callbacks

## Consequences

- No duplicate timeline merge logic in UI
- Changes to display require projection updates only
- Track OS must remain read-only (no mutations from admin pane)

## Alternatives rejected

- Per-module admin pages with separate API calls (rejected: inconsistent truth)
- Client-side merge of multiple APIs (rejected: duplicate logic)
