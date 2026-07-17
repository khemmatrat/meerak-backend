# ADR-003: FairPlay Cannot Change Food Workflow

**Status:** Accepted  
**Date:** 2026-07-17

## Decision

FairPlay OS is a **governance layer** that consumes events. It must not modify Food Delivery OS workflow, APIs, or UI flows.

## Rationale

- Food OS v1.0.0 is frozen operational baseline
- Mixing incentive logic into dispatch/confirm gates creates untestable coupling
- Policy changes should not require redeploying storefront

## Consequences

- No FairPlay code in `apps/storefront` operational paths
- No trust score widgets in customer/merchant/rider apps (v1)
- FairPlay emits `fairplay.*` events only

## Alternatives rejected

- Embedded trust score in rider accept API (rejected: violates boundary)
- FairPlay modifying dispatch priority (rejected: operational coupling)
