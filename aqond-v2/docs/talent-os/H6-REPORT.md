# H6 — Discoverability & Satellite Navigation

**Program:** Talent OS Production Hardening · H6  
**Date:** 2026-07-19  
**Commit:** `feat(talent): H6 discoverability`  
**Closes:** R3 **LG-B1** · R4 **C6** (platform entry) · partial **C-3** (satellite shortcuts)

---

## Objective

Users must reach **Talent Workspace** (`/m/talent`) from governed AQOND hubs — **without typing URLs** — across Guest, Verified, Provider, and Employer roles.

**Scope:** Hub entry, navigation, onboarding, empty-state guide, satellite shortcuts — **no business logic changes**.

---

## Before

| Entry surface | Talent link |
|---------------|-------------|
| Services hub (`/m/services`) | ❌ None |
| Services shell header | ❌ None |
| Account / Marketplace (`MpServiceRows`) | ❌ None |
| Account menu | ❌ None |
| Onboarding intent | ❌ None |
| Home welcome overlay | ❌ None |
| Today satellites (Search/Inbox/Timeline/Chat) | Header icons only — not on Today |

**Result:** Talent only reachable via direct URL or sidebar back-link from inside workspace.

---

## After — Hub entry matrix

| Surface | Path | Role coverage |
|---------|------|---------------|
| **Services hub** | Featured `Talent OS` card → `/m/talent` | All (incl. Guest) |
| **Services shell** | Header ✨ icon → `/m/talent` | All |
| **Account services row** | `MpServiceRows` first tile | Logged-in |
| **Account menu** | `MpAccountMenu` first item | Logged-in |
| **Account guest hero** | Links to Talent + Services | Guest |
| **Onboarding intent** | `Talent OS` intent tile | Post-login |
| **Marketplace welcome** | `FtxWelcomeOverlay` card | Guest browse |
| **Today guest guide** | `TalentDiscoverGuide` → Services / Home / Account | Guest |
| **Today satellites** | Shortcut row (role-filtered) | Logged-in |

---

## Implementation

| File | Change |
|------|--------|
| `lib/talent/talentDiscoverability.ts` | SSOT: `TALENT_HUB_TILE`, platform entries, satellite config |
| `components/talent/TalentSatelliteShortcuts.tsx` | Role-aware shortcut row |
| `components/talent/TalentDiscoverGuide.tsx` | Guest hub guide |
| `components/talent/TalentTodayView.tsx` | Guide (guest) + shortcuts (logged-in) |
| `app/m/services/page.tsx` | Featured Talent card |
| `components/mobile/ServicesShell.tsx` | Header entry icon |
| `components/mobile/MpMeHubSections.tsx` | Service row + account menu |
| `app/m/account/page.tsx` | Guest discover links |
| `app/m/onboarding/intent/page.tsx` | Talent intent |
| `components/experience/FtxWelcomeOverlay.tsx` | Marketplace tile |
| `app/m/services/services-axs.css` | Featured card styling |
| `app/m/talent/talent-axs.css` | Satellite + guide styling |

### Satellite shortcuts (permission-filtered)

| Shortcut | Route | Permission |
|----------|-------|--------------|
| ค้นหา | `/m/talent/search` | `nav:today` |
| แจ้งเตือน | `/m/talent/notifications` | `today:notifications` |
| Timeline | `/m/talent/timeline` | `today:notifications` |
| แชท | `/m/talent/chat` | `today:notifications` |

---

## Role discoverability

| Role | How to reach Talent (≤2 taps, no URL) |
|------|--------------------------------------|
| **Guest** | Home welcome → Talent · Services hub card · Account guest links · Today guide |
| **Verified / Provider / Enterprise** | Account menu · Services hub · MpServiceRows · Today already inside |
| **Employer** | Same hub entries · Today satellites per permissions |
| **Customer** | Same hub entries · fewer satellite chips (no notifications cohort) |

---

## Risk

| Risk | Level | Note |
|------|-------|------|
| Extra UI on Services/Account | Low | Single tile per surface — product-approved pattern |
| Guest lands Today logged-out | Low | Login CTA + platform guide unchanged intent |
| Satellite row clutter | Low | Max 4 chips, permission-filtered |

---

## Rollback

Remove `TALENT_HUB_TILE` usages and delete discoverability components; restore prior hub layouts.

---

## Acceptance checklist

- [x] Services hub links to `/m/talent`
- [x] Account / Marketplace path links to `/m/talent`
- [x] Onboarding includes Talent intent
- [x] Guest Today shows platform guide (no URL typing)
- [x] Logged-in Today shows satellite shortcuts
- [x] SSOT config in `talentDiscoverability.ts`
- [x] No business logic / API changes

---

## Out of scope

- Bottom tab bar Talent icon (IA redesign)
- Placeholder tab relabel (R5 C-4)
- Role switch redirect (R5 C-1 — covered by H1 guard)
