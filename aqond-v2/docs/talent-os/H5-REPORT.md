# H5 — Shared Cache & Fetch Deduplication

**Program:** Talent OS Production Hardening · H5  
**Date:** 2026-07-19  
**Commit:** `perf(talent): H5 shared cache`  
**Closes:** R4 **C7** (Performance / duplicate fetch)

---

## Objective

Reduce duplicate network requests and redundant React state across Talent modules (Today, Timeline, Search, Commerce, Chat, Notifications) without changing UX.

---

## Before

| Module | Loader | Issue |
|--------|--------|-------|
| Today | `loadTalentTodayRaw()` | Independent fetch every mount |
| Timeline | `loadTalentSearchRaw()` | Same 7 parallel APIs as Search — no sharing |
| Search | `loadTalentSearchRaw()` | Refetch on every tab visit |
| Commerce | `loadTalentCommerceRaw()` | Duplicate match/board/booking/wallet/reviews |
| Chat | `loadTalentChatRaw()` → Search raw + shop inbox | Nested duplicate |
| Notifications | `fetchTalentNotifications()` only | Duplicate if Search already loaded |

**Additional issues:**

- React Strict Mode double-mount → duplicate in-flight requests
- Tab visibility → unconditional refetch (even when data fresh)
- No cross-module cache (Search → Notifications)

---

## After

```
┌─────────────────────────────────────────┐
│     talentDataCache (in-memory)         │
│  TTL 30s · in-flight dedupe · prime     │
└─────────────────────────────────────────┘
         ▲              ▲              ▲
         │              │              │
  useTalentRawData   notifications   chat cached
  (today/search/     hook             loader
   commerce)
```

### Cache keys

| Profile | Key | Source loader |
|---------|-----|---------------|
| Today | `talent:today:{userId}` | `loadTalentTodayRaw` |
| Search / Timeline | `talent:search:{userId}` | `loadTalentSearchRaw` |
| Commerce | `talent:commerce:{userId}` | `loadTalentCommerceRaw` |
| Chat | `talent:chat:{userId}` | `loadTalentChatRaw` |
| Notifications | `talent:notifications:{userId}:{limit}` | `fetchTalentNotifications` |

### Cross-prime

When Today/Search raw loads, notifications cache is primed → Notification Center avoids redundant fetch if user visited Search/Today first.

---

## Implementation

| File | Role |
|------|------|
| `lib/talent/cache/talentDataCache.ts` | TTL cache + in-flight dedupe |
| `lib/talent/cache/talentRawLoaders.ts` | Cached profile loaders |
| `hooks/talent/useTalentRawData.ts` | Shared hook (Today/Search/Timeline/Commerce) |
| `hooks/talent/useTalentToday.ts` | Thin compose wrapper |
| `hooks/talent/useTalentTimeline.ts` | Reuses `search` profile |
| `hooks/talent/useTalentSearch.ts` | Reuses `search` profile |
| `hooks/talent/useTalentCommerce.ts` | `commerce` profile |
| `hooks/talent/useTalentNotifications.ts` | Cached + cache hit on mount |
| `hooks/talent/useTalentChatWorkspace.ts` | Cached chat raw |

### Behaviour (UX unchanged)

- **Manual reload** → `force=true` bypasses cache
- **Tab visibility** → refresh only if TTL expired (`force=false`)
- **Cache hit on mount** → instant paint, `loading=false` (no skeleton flash)
- **Compose layers** → `useMemo` unchanged (render dedup)

---

## Request reduction (expected)

| Scenario | Before | After |
|----------|--------|-------|
| Today → Search within 30s | 2× full parallel bundles | 1× (search cache hit) |
| Search → Timeline within 30s | 2× identical bundles | 0× network (shared `search` key) |
| Search → Notifications within 30s | Search + notifications API | Notifications from primed cache |
| Strict Mode double mount | 2× in-flight | 1× (deduped promise) |
| Tab refocus within TTL | Unconditional refetch | Cache hit, no network |

---

## Risk

| Risk | Level | Mitigation |
|------|-------|------------|
| Stale data up to 30s | Low | Manual reload forces refresh; visibility refetches after TTL |
| Memory per user session | Low | Map cleared on navigation away; keys scoped by userId |
| Commerce vs Search not merged | Medium | Different profiles (includeExpired match) — intentional |

---

## Rollback

Remove `lib/talent/cache/`, restore hooks to direct `loadTalent*Raw` calls.

---

## Acceptance checklist

- [x] Shared in-memory cache with 30s TTL
- [x] In-flight request deduplication
- [x] Timeline + Search share `search` profile
- [x] Notifications cross-prime from Today/Search
- [x] Cache-aware visibility refresh
- [x] Manual reload bypasses cache
- [x] No UX / layout changes
- [x] Compose memoization preserved

---

## Out of scope

- Sub-resource caching (match/board/wallet individual keys)
- sessionStorage persistence
- React Query / SWR dependency
- Server-side cache
