# H3 — Deep Link Integrity

**Program:** Talent OS Production Hardening · H3  
**Date:** 2026-07-19  
**Commit:** `fix(talent): H3 deep link integrity`  
**Closes:** R2 **I-B2** · R3 **LG-B4** · R4 **C3**

---

## Objective

Audit and repair all Talent-generated deep links so every href resolves to a **real route** — no broken `#chat` anchors, no 404 dead ends, no placeholder calendar traps from live modules.

**Scope:** Link builders and compose layers only — **no new routes**.

---

## Issues found (before)

| ID | Issue | Example | Impact |
|----|-------|---------|--------|
| DL-1 | Broken `#chat` hash on Match links | `/m/services/match/:id#chat` | Hash ignored — dead anchor (R2 I-B2) |
| DL-2 | Invalid chat route | `/m/chat` (no index page) | 404 — only `/m/chat/[shopId]` exists |
| DL-3 | Calendar placeholder from live modules | `/m/talent/calendar` | Dead-end placeholder from Search/Timeline/Notifications (R3 LG-B4) |
| DL-4 | Scattered inline URL builders | Duplicate encode logic across compose files | Drift risk |

**Nav tab `/m/talent/calendar` unchanged** — user can still open Calendar tab (placeholder with outbound links). Only **composed deep links** rerouted.

---

## Fixes applied

### 1. Central link registry (`talentTodayLinks.ts`)

| Helper / constant | Target | Notes |
|-------------------|--------|-------|
| `talentMatchJobHref(id)` | `/m/services/match/:id` | No hash |
| `talentBoardJobHref(id)` | `/m/services/board/:id` | Board SSOT |
| `TALENT_TODAY_LINKS.calendar` | `/m/services/booking/mine` | Was placeholder tab |
| `TALENT_TODAY_LINKS.accountWallet` | `/m/account/wallet` | Payment notifications (H2 SSOT) |
| `talentNotificationHref()` | See matrix below | Removed `#chat` and `/m/chat` |

### 2. Chat links (`talentChatLinks.ts`)

- `matchJob()` → `talentMatchJobHref()` (no `#chat`)
- Merchant/support paths unchanged (`/m/chats`, `/m/chat/:shopId`, help)

### 3. Compose alignment

| Module | Change |
|--------|--------|
| Today | Match/Board cards use shared helpers |
| Search | Match/Board results use shared helpers |
| Timeline | Match/Board events use shared helpers |
| Commerce | `talentCommerceMatchHref` / `talentCommerceBoardHref` delegate to helpers |
| Chat | Match conversations use hash-free match href |
| Notifications | Via `talentNotificationHref()` |
| AI | Placeholders verified — all routes exist |

---

## Deep link matrix (after)

| Source | Category | Resolved href | Route status |
|--------|----------|---------------|--------------|
| Notification | Match job | `/m/services/match/:id` | ✅ |
| Notification | Board/advance | `/m/services/board/:id` | ✅ |
| Notification | Booking | `/m/services/booking/mine?tab=incoming` | ✅ |
| Notification | Calendar/schedule | `/m/services/booking/mine` | ✅ |
| Notification | Wallet/payment | `/m/account/wallet` | ✅ |
| Notification | Review | `/m/talent/trust` | ✅ (placeholder tab) |
| Notification | Chat (no job) | `/m/talent/chat` | ✅ |
| Search/Timeline | Calendar booking | `/m/services/booking/mine` | ✅ |
| Chat workspace | Match thread | `/m/services/match/:id` | ✅ |
| Chat workspace | Merchant | `/m/chat/:shopId` | ✅ |
| Commerce | Match/Board item | Shared helpers | ✅ |
| AI suggestions | Services surfaces | `/m/services/*` | ✅ |

---

## Files changed

| File | Change |
|------|--------|
| `lib/talent/talentTodayLinks.ts` | Helpers, notification router, calendar + wallet SSOT |
| `lib/talent/talentChatLinks.ts` | Remove `#chat` |
| `lib/talent/talentSearchCompose.ts` | Shared match/board hrefs |
| `lib/talent/talentTimelineCompose.ts` | Shared match/board hrefs |
| `lib/talent/talentChatCompose.ts` | Hash-free match conversations |
| `lib/talent/commerce/talentCommerceLinks.ts` | Delegate to shared helpers |
| `components/talent/TalentTodayView.tsx` | Shared match/board hrefs |

---

## Verification

```bash
# No Talent-generated #chat links
rg '#chat' aqond-v2/apps/storefront/lib/talent aqond-v2/apps/storefront/components/talent
# → 0 matches

# No bare /m/chat (invalid index)
rg "'/m/chat'" aqond-v2/apps/storefront/lib/talent
# → 0 matches
```

---

## Risk

| Risk | Level | Mitigation |
|------|-------|------------|
| Chat notifications land on Match detail, not inline chat | Low | Until Services `#chat` anchor SSOT — documented |
| Calendar deep links go to Booking list, not date view | Low | Booking is schedule SSOT per R5 B-3 |
| Trust tab still placeholder | Low | Route exists; content RFC separate |

---

## Rollback

1. Restore `#chat` suffix in `talentTodayLinks.ts` / `talentChatLinks.ts`.
2. Set `TALENT_TODAY_LINKS.calendar` back to `/m/talent/calendar`.
3. Restore `/m/chat` fallback in `talentNotificationHref`.

---

## Acceptance checklist

- [x] Zero Talent `#chat` hash links
- [x] Zero links to non-existent `/m/chat` index
- [x] Search/Timeline/Notification calendar → Booking SSOT
- [x] All Match/Board links use verified Services routes
- [x] No new routes created
- [x] Nav Calendar tab preserved (not in scope for reroute)

---

## Out of scope

- Services Match detail `#chat` anchor implementation (Services OS)
- Full calendar RFC / `/m/talent/calendar` content
- B-6 SSOT link registry doc (optional follow-up)
