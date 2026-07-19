# TOS-5 Implementation Report — Notification Center

**Phase:** TOS-5 · **Date:** 2026-07-19 · **Status:** Complete

## Charter

Notification Center = **presentation-only inbox** at `/m/talent/notifications`. Reuses existing `GET /api/notifications/latest` via `fetchTalentNotifications`. No backend, DB, new API, or mark-read mutation.

Reference: [11-TALENT-OS-BLUEPRINT.md](./11-TALENT-OS-BLUEPRINT.md) · [TOS-4-ARCHITECT-REVIEW.md](./TOS-4-ARCHITECT-REVIEW.md)

## Route

| Path | Component |
|------|-----------|
| `/m/talent/notifications` | `NotificationCenter` |

Entry: Today → “ดูทั้งหมด” on notifications section (`TALENT_TODAY_LINKS.notifications`).

## Components

| Component | Path | Role |
|-----------|------|------|
| `NotificationCenter` | `components/talent/notifications/NotificationCenter.tsx` | Page shell, grouping, refresh |
| `NotificationFilter` | `components/talent/notifications/NotificationFilter.tsx` | Filter chips (client-only) |
| `NotificationItem` | `components/talent/notifications/NotificationItem.tsx` | Row + deep link |
| `NotificationEmpty` | `components/talent/notifications/NotificationEmpty.tsx` | Empty / error / guest |
| `NotificationSkeleton` | `components/talent/notifications/NotificationSkeleton.tsx` | Loading state |

## Data & presentation lib

| Artifact | Purpose |
|----------|---------|
| `hooks/talent/useTalentNotifications.ts` | Fetch via existing `fetchTalentNotifications(auth, 50)` |
| `lib/talent/talentNotificationPresentation.ts` | Category, unread, filter, group (Today/Yesterday/Older) |
| `lib/talent/talentTodayLinks.ts` | Extended `talentNotificationHref` — wallet, review, calendar |
| `lib/talent/talentTodayCompose.ts` | Today unread chip uses shared `isTalentNotificationUnread` |

## Filters (read-only)

| Filter | Rule |
|--------|------|
| All | All rows |
| Unread | `isTalentNotificationUnread` (API fields only) |
| Booking | Category heuristic |
| Work | Match / Board / job types |
| Money | Payment / wallet / escrow |
| Review | Review / rating types |
| Chat | Chat / message / job_progress |
| Calendar | Calendar / schedule / reminder |

## Deep links (reuse SSOT)

| Category | Target |
|----------|--------|
| Booking | `/m/services/booking/mine?tab=incoming` |
| Match / chat | `/m/services/match/:id` or `#chat` |
| Board | `/m/services/board/:id` |
| Wallet / money | `/m/talent/money` |
| Review | `/m/talent/trust` |
| Calendar | `/m/talent/calendar` |
| Chat (no job) | `/m/chat` |

## Scope compliance

| Rule | Result |
|------|--------|
| Presentation only | ✅ |
| No backend / DB / new API | ✅ |
| Reuse existing notification endpoint | ✅ `fetchTalentNotifications` |
| No duplicated business logic | ✅ Single href + category module |
| No mutation | ✅ No mark-read calls |
| Grouping Today / Yesterday / Older | ✅ |
| Read-only | ✅ |

## Acceptance

| Check | Result |
|-------|--------|
| Compile | ✅ `npm run build` (storefront webpack) |
| No duplicated business logic | ✅ Shared `talentNotificationHref` + presentation helpers |
| No backend modification | ✅ |
| Evidence doc | ✅ This file |

**STOP FOR REVIEW**
