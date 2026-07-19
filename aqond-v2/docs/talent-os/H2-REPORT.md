# H2 — Wallet SSOT Alignment

**Program:** Talent OS Production Hardening · H2  
**Date:** 2026-07-19  
**Commit:** `fix(wallet): H2 wallet ssot alignment`  
**Closes:** R2 **I-B1** · R4 **C1**

---

## Objective

Eliminate **dual wallet read models** in Talent Money — one legacy summary API and one Account BFF path. Talent Today, Commerce, Search, and Timeline must read the **same SSOT** as `/m/account/wallet`.

**Scope:** Read layer, adapter, mapping, BFF client only — no ledger, wallet core, or backend logic changes.

---

## Before (dual model)

| Surface | Read path | Fields | SSOT owner |
|---------|-----------|--------|------------|
| Account wallet `/m/account/wallet` | `bffGet('/v1/wallet?user_id=…')` | `balance_micro`, coins, coupons | **wallet-svc** via BFF |
| Talent Today / Money / Search / Timeline | `fetch('/api/wallet/:userId/summary')` (legacy) | `available`, `pending`, `total` (Mongo user) | **Legacy Node** |

**Risk:** Balances could diverge between Account and Talent for the same user.

---

## After (single model)

| Surface | Read path | Mapping |
|---------|-----------|---------|
| Account wallet | `bffGet /v1/wallet?user_id=` | `formatMicro(balance_micro)` |
| Talent (all modules) | **Same** `bffGet /v1/wallet?user_id=` | `talentWalletAdapter.mapAccountWalletToTalentSummary()` |

### Field mapping

| Account BFF (SSOT) | Talent presentation |
|--------------------|---------------------|
| `balance_micro` | `available` = `balance_micro / 1_000_000` |
| `transactions[]` HOLD − RELEASE/REFUND | `pending` (ledger-derived, same payload) |
| `available + pending` | `total` |
| `currency` | `currency` (trace) |

**Acceptance:** Talent **ใช้ได้ / available** equals Account **AqondPay** balance (`formatMicro(balance_micro)`).

---

## Files changed

| File | Change |
|------|--------|
| `lib/talent/wallet/talentWalletTypes.ts` | BFF response + Talent presentation types |
| `lib/talent/wallet/talentWalletAdapter.ts` | SSOT fetch + map (replaces legacy summary) |
| `lib/talent/talentTodaySources.ts` | Re-export adapter; remove legacy `/api/wallet/.../summary` |
| `components/talent/TalentTodayView.tsx` | Error copy + AqondPay label |
| `components/talent/commerce/CommerceIntelligenceDashboard.tsx` | Error copy + SSOT label |

**Unchanged consumers (auto-aligned via shared fetch):**

- `lib/talent/commerce/talentCommerceSources.ts`
- `lib/talent/talentSearchCompose.ts`
- `lib/talent/talentTimelineCompose.ts`
- `lib/talent/commerce/talentCommerceCompose.ts`

---

## Evidence

### Legacy path removed

```diff
- fetch(meerakLegacyUrl(`/api/wallet/${userId}/summary`))
+ bffGet(`/v1/wallet?user_id=${userId}`)
```

### BFF chain (unchanged platform)

```
Storefront bffGet → /api/bff/v1/wallet
  → bff-svc wallet handler
  → wallet-svc /v1/balance?owner_id=&owner_type=buyer
  → wallet-svc /v1/ledger?owner_id=
```

Same chain as `app/m/account/wallet/page.tsx`.

---

## Role × surface matrix (wallet read)

| Role | Today wallet card | Money Commerce wallet | Account wallet |
|------|-------------------|----------------------|----------------|
| provider | BFF SSOT | BFF SSOT | BFF SSOT |
| employer | BFF SSOT | BFF SSOT | BFF SSOT |
| verified / enterprise | BFF SSOT | BFF SSOT | BFF SSOT |
| customer | hidden (H1 guard) | hidden (H1 guard) | BFF SSOT |

---

## Risk

| Risk | Level | Note |
|------|-------|------|
| Display numbers change vs legacy Mongo summary | Medium | Expected — SSOT is authoritative |
| `pending` derived from ledger entries, not Mongo `wallet_pending` | Low | Same BFF read; may show 0 when no HOLD entries |
| `wallet_frozen` not in BFF | Low | Legacy flag dropped; frozen state is platform gap (out of H2 scope) |

---

## Rollback

1. Restore `fetchTalentWalletSummary` in `talentTodaySources.ts` to legacy `meerakLegacyUrl('/api/wallet/.../summary')`.
2. Remove `lib/talent/wallet/` adapter files.
3. Revert UI copy in Today + Commerce dashboard.

---

## Acceptance checklist

- [x] Single wallet read API for Talent (`bffGet /v1/wallet`)
- [x] No legacy `/api/wallet/:id/summary` in Talent read layer
- [x] `available` maps from `balance_micro` (Account parity)
- [x] Deep link remains `/m/account/wallet` (unchanged)
- [x] No backend / ledger / wallet-svc code changes

---

## Out of scope

- R3 LG-B3 (duplicate condition — closed by same fix)
- B-4 legacy transport for notifications/reviews
- B-5 Commerce non-ledger income disclaimer (separate hardening item)
- Server-side wallet frozen enforcement
