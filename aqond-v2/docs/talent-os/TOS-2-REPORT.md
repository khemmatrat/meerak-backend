# TOS-2 Implementation Report — Today Aggregation Layer

**Phase:** TOS-2 · **Date:** 2026-07-19 · **Status:** Complete

## Charter

Today tab = **read-only aggregation** of existing SSOTs. No new API contracts, DB schema, or backend logic.

Reference: [11-TALENT-OS-BLUEPRINT.md](./11-TALENT-OS-BLUEPRINT.md) §2 Workspace Mapping (Today-first)

## Data sources (existing only)

| Widget | Existing SSOT | Client function / endpoint |
|--------|---------------|----------------------------|
| Match working | `fetchMyMatchJobs` + `filterMyMatchJobs('working')` | `/api/services/match/jobs/mine` → backend |
| Board applications | `fetchMyBoardApplications` | `/api/services/board/jobs/applications` |
| Upcoming booking | `fetchIncomingBookings` + `fetchMyBookingRequests` | booking BFF routes |
| Notifications | `GET /api/notifications/latest` | legacy backend (mobile parity) |
| Wallet summary | `GET /api/wallet/:userId/summary` | legacy backend |
| Worker reviews | `GET /api/reviews/worker/:userId` | legacy backend |

## Files

| File | Role |
|------|------|
| `hooks/talent/useTalentToday.ts` | Client hook — load + compose |
| `lib/talent/talentTodaySources.ts` | Parallel fetch from existing APIs |
| `lib/talent/talentTodayCompose.ts` | Pure aggregation (slice/sort/count) |
| `lib/talent/talentTodayLinks.ts` | Deep links to Services + account |
| `lib/talent/talentClient.ts` | Legacy backend URL + auth headers |
| `components/talent/TalentTodayView.tsx` | Today UI sections |
| `app/m/talent/page.tsx` | Route entry |

## Aggregation rules (no duplicated business logic)

- **Match active:** reuses `filterMyMatchJobs(..., 'working', userId)` from Services
- **Bookings upcoming:** client sort/filter on `start_time` + status only (display)
- **Board recent:** sort by `created_at`, slice top 3
- **Notifications:** sort by `sentAt`, map to deep link via `talentNotificationHref`
- **Wallet / reviews:** pass-through from existing GET responses

## Deep links

| Section | Target |
|---------|--------|
| Match card | `/m/services/match/[id]` |
| Board card | `/m/services/board/[job_id]` |
| Booking card | `/m/services/booking/mine` |
| Notification | Resolved per type → match/board/booking/account |
| Wallet | `/m/talent/money` |
| Reviews | `/m/talent/trust` |

## Scope compliance

| Rule | Result |
|------|--------|
| No new API | ✅ |
| No new database / schema | ✅ |
| No backend logic change | ✅ |
| Compose existing hooks/services | ✅ |
| Aggregation layer only | ✅ |

## Acceptance

| Check | Result |
|-------|--------|
| No duplicated business logic | ✅ Uses `filterMyMatchJobs`, existing fetch* only |
| Everything uses existing services | ✅ |
| Build (compile) | ✅ TOS-2 files lint clean |
| Guest state | ✅ Login banner, no fetch |
| Logged-in partial failure | ✅ Per-source `safeFetch`, section empty states |

## Config note

Legacy wallet/notifications/reviews call `NEXT_PUBLIC_MEERAK_BACKEND_URL` when set; otherwise same-origin `/api/*` (requires nginx/backend routing in prod).

**STOP FOR REVIEW**
