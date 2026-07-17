# ADR-002: Claim OS Owns Settlement Authority

**Status:** Accepted  
**Date:** 2026-07-17

## Decision

Dispute resolution — settle, partial refund, replace, re-dispatch, escalate, close — is owned exclusively by **Claim OS** modules and `/api/disputes/*` routes.

## Rationale

- Financial outcomes require single audit trail
- Claim events (`claim.*`, `order.refunded`) feed Track OS and future FairPlay
- Prevents ad-hoc refunds from merchant or rider modules

## Consequences

- All refund execution flows through `claimSettlement.ts`
- FairPlay may recommend policy outcomes but **cannot** override settlement
- Five claim categories frozen in `disputePolicy.ts`

## Alternatives rejected

- Merchant-initiated refunds without claim case (rejected: audit gap)
- FairPlay-triggered refunds (deferred to separate wallet integration)
