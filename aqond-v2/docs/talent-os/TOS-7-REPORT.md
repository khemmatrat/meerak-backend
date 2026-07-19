# TOS-7 Implementation Report — Activity Timeline

**Phase:** TOS-7 · **Date:** 2026-07-19 · **Status:** Complete

## Charter

Activity Timeline = **presentation-only chronological feed** at `/m/talent/timeline`. Composes existing parallel fetches into unified events. No backend, DB, event store, or indexing.

Reference: [11-TALENT-OS-BLUEPRINT.md](./11-TALENT-OS-BLUEPRINT.md) · [TOS-6-REPORT.md](./TOS-6-REPORT.md)

## Route

| Path | Component |
|------|-----------|
| `/m/talent/timeline` | `ActivityTimeline` |

## Components

| Component | Path | Role |
|-----------|------|------|
| `ActivityTimeline` | `components/talent/timeline/ActivityTimeline.tsx` | Page shell, period filter, day groups |
| `TimelineFilter` | `components/talent/timeline/TimelineFilter.tsx` | Today / Week / Month |
| `TimelineItem` | `components/talent/timeline/TimelineItem.tsx` | Event row + deep link |
| `TimelineEmpty` | `components/talent/timeline/TimelineEmpty.tsx` | Guest / error / empty |
| `TimelineSkeleton` | `components/talent/timeline/TimelineSkeleton.tsx` | Loading state |

## Composed sources

| Source | Timestamp field | Deep link |
|--------|-----------------|-----------|
| Booking | `start_time` → `created_at` | `/m/services/booking/mine` |
| Match | `datetime` → `created_at` | `/m/services/match/:id` |
| Board | `created_at` | `/m/services/board/:jobId` |
| Wallet | snapshot (fetch time) | `/m/talent/money` |
| Reviews | `created_at` | `/m/talent/trust` |
| Notifications | `sentAt` → `created_at` | `talentNotificationHref` |
| Calendar | booking `start_time` | `/m/talent/calendar` |

## Sort & filter

| Rule | Implementation |
|------|----------------|
| Sort | Newest first (`occurredAtMs` desc) |
| Today | `>=` start of local day |
| Week | last 7 days |
| Month | last 30 days |
| Day groups | วันนี้ / เมื่อวาน / ก่อนหน้านี้ |

## Data layer

| Artifact | Purpose |
|----------|---------|
| `loadTalentTimelineRaw` | Alias of `loadTalentSearchRaw` (wider read limits) |
| `composeTalentTimelineEvents` | Map raw → `TalentTimelineEvent[]` |
| `filterTalentTimelineByPeriod` | Client period filter |
| `groupTalentTimelineByDay` | Presentation grouping |

## Scope compliance

| Rule | Result |
|------|--------|
| Presentation only | ✅ |
| No backend / DB / event store | ✅ |
| Compose existing fetches | ✅ |
| Deep links only | ✅ |
| Newest first | ✅ |
| Period filters Today/Week/Month | ✅ |

## Acceptance

| Check | Result |
|-------|--------|
| Compile | ✅ storefront webpack |
| No backend modification | ✅ |
| Evidence doc | ✅ This file |

**STOP FOR REVIEW**
