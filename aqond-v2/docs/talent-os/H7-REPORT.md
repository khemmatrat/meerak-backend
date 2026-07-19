# H7 — Enterprise Governance & Executive Closure

**Program:** Talent OS Production Hardening · H7  
**Date:** 2026-07-19  
**Commit:** `docs(talent): H7 enterprise governance`  
**Closes:** R4 Executive Conditions **C1–C7** (full closure)

---

## Objective

Close all **Executive Architecture mandatory conditions** from [TOS-R4-EXECUTIVE-SIGNOFF.md](./TOS-R4-EXECUTIVE-SIGNOFF.md) through release governance — feature flags, beta controls, disclosures, documentation, and production checklist — **without adding product features**.

**Scope:** Documentation + presentation-layer governance only.

---

## Executive decision upgrade

| Before H7 | After H7 |
|-----------|----------|
| R4 **APPROVED WITH CONDITIONS** | **APPROVED FOR GENERAL PRODUCTION** |
| C1–C6 partial / documented owners | C1–C7 **closed with evidence** |
| No public release notes | Published release notes + in-app disclosures |

---

## Closed Executive Conditions

| # | Condition | Hardening | H7 evidence |
|---|-----------|-----------|-------------|
| **C1** | Wallet SSOT policy | H2 | `talentWalletAdapter` · BFF `/v1/wallet` · H2-REPORT |
| **C2** | Route–role governance | H1 | `TalentRouteGuard` · 12 routes mapped · H1-REPORT |
| **C3** | Deep link integrity | H3 | No `#chat` · calendar → booking · H3-REPORT |
| **C4** | Legacy read transport | H4 | `/api/talent/read/*` proxy · H4-REPORT |
| **C5** | Executive release comms | **H7** | Release notes · mock AI · commerce · placeholder disclosures |
| **C6** | Platform entry | H6 | Services/Account/onboarding · H6-REPORT |
| **C7** | Scale plan registered | H5 + **H7** | 30s cache · `NEXT_PUBLIC_TALENT_CACHE_TTL_MS` · checklist |

---

## H7 implementation

### Governance SSOT (code)

| File | Role |
|------|------|
| `lib/talent/talentReleaseGovernance.ts` | Feature flags + disclosure copy |
| `components/talent/TalentBetaBanner.tsx` | Beta cohort banner |
| `components/talent/TalentGovernanceNotice.tsx` | Inline governance notices |

### Feature flags

| Env | Default | Purpose |
|-----|---------|---------|
| `NEXT_PUBLIC_TALENT_OS_ENABLED` | `1` | Master enable / rollback |
| `NEXT_PUBLIC_TALENT_OS_BETA` | `1` | Beta banner |
| `NEXT_PUBLIC_TALENT_AI_MOCK` | `1` | Mock AI disclosure |
| `NEXT_PUBLIC_TALENT_ROLE_HINTS` | off in prod | Client role hints (F-2 Phase 1) |
| `NEXT_PUBLIC_TALENT_CACHE_TTL_MS` | `30000` | Cache TTL (C7) |

Documented in `apps/storefront/.env.example`.

### UI disclosures (C5)

| Surface | Disclosure |
|---------|------------|
| Workspace shell | Beta banner + role disclaimer |
| AI Workspace | Mock provider banner |
| Commerce | Non-ledger disclaimer |
| Notifications | Read-only inbox note |
| Placeholder tabs | “เร็วๆ นี้” (no TOS phase IDs) |
| Enterprise role | Preview copy |
| Empty states | User Thai messages (no `/api/` strings) |

### Documentation deliverables

| Document | Purpose |
|----------|---------|
| [TALENT-OS-RELEASE-NOTES.md](./TALENT-OS-RELEASE-NOTES.md) | User + support release notes |
| [TALENT-OS-PRODUCTION-CHECKLIST.md](./TALENT-OS-PRODUCTION-CHECKLIST.md) | Pre-deploy + QA sign-off |
| [TALENT-OS-DEVELOPER-NOTES.md](./TALENT-OS-DEVELOPER-NOTES.md) | Engineering runbook |
| [TALENT-SSOT-LINK-REGISTRY.md](./TALENT-SSOT-LINK-REGISTRY.md) | Link → owner map |
| [TALENT-OS-ARCHITECTURE-DEBT.md](./TALENT-OS-ARCHITECTURE-DEBT.md) | Post-H7 debt register |

---

## H1–H7 program summary

| Program | Commit | Closes |
|---------|--------|--------|
| H1 Security guard | `3cd748e1` | C2 · LG-B2 |
| H2 Wallet SSOT | `4fba753c` | C1 · LG-B3 |
| H3 Deep links | `e369c25a` | C3 · LG-B4 |
| H4 Legacy BFF | `792a5a70` | C4 |
| H5 Shared cache | `f239aae7` | C7 (partial) |
| H6 Discoverability | `56495e38` | C6 · LG-B1 |
| H7 Governance | *(this commit)* | C5 · C7 register · executive closure |

---

## Architecture debt (executive view)

**Closed:** AD-1, AD-2, AD-3, AD-6, AD-8, AD-12, AD-15, AD-17, AD-21, AD-22, AD-23, AD-24

**Remaining (non-blocking):** AD-4 placeholder wraps, AD-13 server entitlements, AD-7 compose dedup — see [TALENT-OS-ARCHITECTURE-DEBT.md](./TALENT-OS-ARCHITECTURE-DEBT.md)

---

## Risk

| Risk | Level | Note |
|------|-------|------|
| Beta banner fatigue | Low | Disable via `BETA=0` post-launch |
| Disclosure copy length | Low | Compact notices + release notes |
| Client-only guard | Medium | Unchanged from H1 — documented |

---

## Rollback

1. Set `NEXT_PUBLIC_TALENT_OS_BETA=0` and `NEXT_PUBLIC_TALENT_OS_ENABLED=0`
2. Remove governance components from shell (optional)
3. Docs remain valid for audit trail

---

## Acceptance checklist

- [x] C1–C7 closed with cross-references to H1–H6 + H7
- [x] Release notes published
- [x] Production checklist published
- [x] Developer notes published
- [x] SSOT link registry published
- [x] Architecture debt register updated
- [x] Feature flags SSOT + `.env.example`
- [x] Beta banner + governance notices in UI
- [x] Mock AI / commerce / notification disclosures
- [x] Placeholder relabel + enterprise preview copy
- [x] No `/api/` strings in user-facing empty states
- [x] No new product features

---

## Out of scope

- Work/Trust/Profile full wraps (v1.1)
- AI Core provider swap
- Server entitlements (F-2 Phase 2)
- Bottom tab Talent icon (IA redesign)

---

## Document control

| Field | Value |
|-------|-------|
| Report ID | H7-REPORT |
| Supersedes | R4 conditional status for C1–C7 |
| Executive status | **APPROVED FOR GENERAL PRODUCTION** |
| Next review | Talent OS v1.1 wrap milestone |
