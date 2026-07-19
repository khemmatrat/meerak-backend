# H1 — Security & Route Guard

**Program:** Talent OS Production Hardening · H1  
**Date:** 2026-07-19  
**Commit:** `fix(talent): H1 security route guard`  
**Closes:** R1 **B-1** · R3 **LG-B2** · R4 **C2**

---

## Objective

Align **Navigation**, **URL access**, and **Role permissions** for all `/m/talent/*` routes so that tabs hidden in nav cannot be opened via direct URL.

**Scope:** Presentation-layer route guard only — no backend, database, API, or business logic changes.

---

## Routes Guarded

| Route | Permission | Sensitive | Login required (401) | Guard action when denied |
|-------|------------|-----------|----------------------|--------------------------|
| `/m/talent` | `nav:today` | — | — | Redirect → `/m/talent?access=denied` |
| `/m/talent/work` | `nav:work` | — | — | Redirect → `/m/talent?access=denied` |
| `/m/talent/money` | `nav:money` | **Yes** (Commerce) | **Yes** | 401 → login · 403 → denied |
| `/m/talent/grow` | `nav:grow` | — | — | Redirect → `/m/talent?access=denied` |
| `/m/talent/ai` | `nav:ai` | **Yes** | — | 401 (guest) · 403 (role) |
| `/m/talent/trust` | `nav:trust` | **Yes** | **Yes** | 401 → login · 403 → denied |
| `/m/talent/calendar` | `nav:calendar` | — | — | Redirect → `/m/talent?access=denied` |
| `/m/talent/profile` | `nav:profile` | — | — | Redirect → `/m/talent?access=denied` |
| `/m/talent/notifications` | `today:notifications` | — | **Yes** | 401 → login · 403 → denied |
| `/m/talent/search` | `nav:today` | — | — | Redirect → `/m/talent?access=denied` |
| `/m/talent/timeline` | `today:notifications` | — | **Yes** | 401 → login · 403 → denied |
| `/m/talent/chat` | `today:notifications` | — | **Yes** | 401 → login · 403 → denied |

---

## Implementation

| File | Change |
|------|--------|
| `lib/talent/talentRolePermissions.ts` | Route→permission map, `canAccessTalentRoute`, sensitive/login-required helpers |
| `components/talent/TalentRouteGuard.tsx` | Client guard: 401 login redirect, 403 `/m/talent?access=denied`, no flash |
| `components/talent/TalentWorkspaceRoot.tsx` | Wrap shell with `TalentRouteGuard` inside `TalentRoleProvider` |

**Behavior:**

1. Unauthenticated user on login-required or sensitive route → `/m/login?next=<path>` (**401**).
2. Authenticated user without permission → `/m/talent?access=denied` (**403**).
3. Role switch while on forbidden path → guard re-evaluates and redirects (R5 C-1 alignment).

---

## Role Matrix — Before vs After

Legend: **Nav** = tab visible · **URL** = direct URL loads content · ✅ allowed · ❌ blocked

### Nav tabs (`TALENT_NAV`)

| Route | guest | verified | provider | employer | customer | enterprise |
|-------|-------|----------|----------|----------|----------|------------|
| **Today** `/m/talent` | Nav ✅ URL ✅ | ✅✅ | ✅✅ | ✅✅ | ✅✅ | ✅✅ |
| **Work** | ✅✅ | ✅✅ | ✅✅ | ✅✅ | ✅✅ | ✅✅ |
| **Money** | Nav ❌ **URL ✅** | ✅✅ | ✅✅ | ✅✅ | Nav ❌ **URL ✅** | ✅✅ |
| **Grow** | ✅✅ | ✅✅ | ✅✅ | Nav ❌ **URL ✅** | Nav ❌ **URL ✅** | ✅✅ |
| **AI** | ✅✅ | ✅✅ | ✅✅ | ✅✅ | Nav ❌ **URL ✅** | ✅✅ |
| **Trust** | Nav ❌ **URL ✅** | ✅✅ | ✅✅ | Nav ❌ **URL ✅** | Nav ❌ **URL ✅** | ✅✅ |
| **Calendar** | Nav ❌ **URL ✅** | ✅✅ | ✅✅ | ✅✅ | ✅✅ | ✅✅ |
| **Profile** | ✅✅ | ✅✅ | ✅✅ | ✅✅ | ✅✅ | ✅✅ |

### Satellite routes (header / deep links)

| Route | guest | verified | provider | employer | customer | enterprise |
|-------|-------|----------|----------|----------|----------|------------|
| **Notifications** | Nav N/A **URL ✅** | ✅✅ | ✅✅ | ✅✅ | ✅✅ | ✅✅ |
| **Search** | ✅✅ | ✅✅ | ✅✅ | ✅✅ | ✅✅ | ✅✅ |
| **Timeline** | Nav N/A **URL ✅** | ✅✅ | ✅✅ | ✅✅ | ✅✅ | ✅✅ |
| **Chat** | Nav N/A **URL ✅** | ✅✅ | ✅✅ | ✅✅ | ✅✅ | ✅✅ |

### After H1 (Nav = URL for all rows)

| Route | guest | verified | provider | employer | customer | enterprise |
|-------|-------|----------|----------|----------|----------|------------|
| **Money** | ❌ (login/denied) | ✅ | ✅ | ✅ | **❌** | ✅ |
| **Grow** | ✅ | ✅ | ✅ | **❌** | **❌** | ✅ |
| **AI** | ✅ | ✅ | ✅ | ✅ | **❌** | ✅ |
| **Trust** | ❌ | ✅ | ✅ | **❌** | **❌** | ✅ |
| **Calendar** | **❌** | ✅ | ✅ | ✅ | ✅ | ✅ |
| **Notifications / Timeline / Chat** | **❌** (401 login) | ✅ | ✅ | ✅ | ✅ | ✅ |

**Primary fix (R1 B-1 / R3 LG-B2):** Customer could open `/m/talent/money` (Commerce Intelligence) while Money tab was hidden → now **403 denied**.

---

## Risk

| Risk | Level | Mitigation |
|------|-------|------------|
| Bookmarked URLs redirect for disallowed roles | Medium | Expected; redirect to Today with `?access=denied` |
| Brief blank frame during redirect | Low | Guard renders `null` until allowed |
| Client-only guard (no server enforcement) | Medium | Documented; matches TOS-3 UI-lens charter; server auth unchanged |
| Guest AI nav vs Customer AI nav inconsistency | Low | Unchanged matrix; A-3 follow-up in R5 |

---

## Rollback

1. Remove `TalentRouteGuard` import/wrapper from `TalentWorkspaceRoot.tsx`.
2. Delete `components/talent/TalentRouteGuard.tsx`.
3. Revert route helper exports from `talentRolePermissions.ts` (keep `NAV_PERM` / `filterTalentNavForRole` intact).

Nav-only filtering restored; direct URL bypass returns.

---

## Acceptance Checklist

- [x] Money (`/m/talent/money`) guarded — Commerce Intelligence not reachable by Customer via URL
- [x] AI (`/m/talent/ai`) guarded — Customer blocked
- [x] Trust (`/m/talent/trust`) guarded — guest / employer / customer blocked per matrix
- [x] All 12 `/m/talent/*` pages mapped to permissions
- [x] Nav ⊆ URL access (no hidden-tab URL bypass)
- [x] 401 login redirect for unauthenticated sensitive/login-required routes
- [x] 403 client redirect for authenticated wrong-role access
- [x] No backend / API / DB changes

---

## Out of Scope (unchanged)

- R1 B-2 legacy API proxy
- R2 I-B1 wallet SSOT read alignment
- R2 I-B2 `#chat` dead links
- A-2 workspace role disclaimer banner
- A-3 Guest vs Customer AI policy harmonization
