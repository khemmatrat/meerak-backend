# H4 — Legacy Read BFF Migration

**Program:** Talent OS Production Hardening · H4  
**Date:** 2026-07-19  
**Commit:** `refactor(talent): H4 legacy read bff`  
**Closes:** R1 **B-2** · R2 **W-I1** · R4 **C4**

---

## Objective

Remove **direct client → legacy backend** transport from Talent read layer. Route Notifications, Reviews, and Wallet Summary through **same-origin storefront proxy / BFF client** with shared adapters — no business logic changes.

---

## Before (direct legacy transport)

| Read | Client path | Transport |
|------|-------------|-----------|
| Notifications | `meerakLegacyUrl('/api/notifications/latest')` | Browser → `NEXT_PUBLIC_MEERAK_BACKEND_URL` |
| Worker reviews | `meerakLegacyUrl('/api/reviews/worker/:id')` | Browser → legacy host |
| Wallet summary | *(fixed H2)* | `bffGet /v1/wallet` |

**Risk:** Undeclared public backend URL, CORS, env drift (R1 B-2, R2 W-I1, R4 C4).

---

## After (storefront read BFF)

```
Talent UI
  → talentReadClient / bffGet (shared client)
  → /api/talent/read/*  OR  /api/bff/v1/wallet
  → server proxy (MEERAK_BACKEND_URL server-side only)
  → legacy backend (same contracts, no logic change)
```

| Read | Client path | Server proxy |
|------|-------------|--------------|
| Notifications | `GET /api/talent/read/notifications/latest` | → `/api/notifications/latest` |
| Worker reviews | `GET /api/talent/read/reviews/worker/:userId` | → `/api/reviews/worker/:userId` |
| Wallet | `GET /api/bff/v1/wallet?user_id=` | → bff-svc wallet (H2) |

---

## Architecture

| Layer | File | Role |
|-------|------|------|
| **Proxy** | `lib/server/talentLegacyReadProxy.ts` | Whitelist + upstream forward |
| **Route** | `app/api/talent/read/[...path]/route.ts` | Same-origin GET handler |
| **Client** | `lib/talent/talentReadClient.ts` | Shared `/api/talent/read` fetch |
| **Adapter** | `notifications/talentNotificationsAdapter.ts` | Map response → `TalentNotificationRow[]` |
| **Adapter** | `reviews/talentReviewsAdapter.ts` | Map response → `TalentWorkerReview[]` |
| **Adapter** | `wallet/talentWalletAdapter.ts` | BFF wallet (H2, unchanged) |
| **Orchestrator** | `talentTodaySources.ts` | Parallel load via adapters only |

**Whitelist (read-only):**

- `notifications/latest`
- `reviews/worker/:userId`

No POST / mutation paths exposed.

---

## Files changed

| File | Change |
|------|--------|
| `lib/server/talentLegacyReadProxy.ts` | New — server proxy |
| `app/api/talent/read/[...path]/route.ts` | New — API route |
| `lib/talent/talentReadClient.ts` | New — shared client |
| `lib/talent/notifications/*` | Types + adapter |
| `lib/talent/reviews/*` | Types + adapter |
| `lib/talent/talentTodaySources.ts` | Remove `meerakLegacyUrl` |
| `lib/talent/talentClient.ts` | Deprecate direct legacy URL helpers |
| UI empty-state copy | Updated path labels |

---

## Verification

```bash
# No direct legacy fetch in Talent lib
rg 'meerakLegacyUrl' aqond-v2/apps/storefront/lib/talent
# → 0 matches (only deprecated helpers in talentClient.ts)

rg 'NEXT_PUBLIC_MEERAK_BACKEND_URL' aqond-v2/apps/storefront/lib/talent
# → 0 matches in read path
```

---

## Risk

| Risk | Level | Note |
|------|-------|------|
| Proxy adds hop latency | Low | Same pattern as booking/match proxies |
| Server `MEERAK_BACKEND_URL` required | Medium | Documented; no public URL needed |
| Whitelist blocks unlisted legacy reads | Low | By design — extend whitelist only |

---

## Rollback

1. Restore `fetchTalentNotifications` / `fetchTalentWorkerReviews` in `talentTodaySources.ts` to `meerakLegacyUrl`.
2. Remove `/api/talent/read` route and adapter modules.

---

## Acceptance checklist

- [x] Talent does not call `meerakLegacyUrl` for reads
- [x] Notifications via `/api/talent/read/notifications/latest`
- [x] Reviews via `/api/talent/read/reviews/worker/:userId`
- [x] Wallet via `/api/bff/v1/wallet` (H2 SSOT)
- [x] Server-side `meerakBackendBase()` for upstream only
- [x] No legacy business logic changes
- [x] Shared client + adapter pattern

---

## Out of scope

- Migrating legacy notifications to commerce notification-svc
- Worker reviews to reviews-svc BFF product API
- POST / mark-read mutations
