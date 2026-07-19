# Talent OS — Architecture Debt Register (Post H7)

**Baseline:** TOS-R4 AD-1~AD-9  
**Updated:** 2026-07-19 after H1–H7 hardening  
**Status:** General production authorized — remaining items are v1.1+ backlog

---

## Closed by hardening (H1–H7)

| ID | Debt | Closed by | Commit |
|----|------|-----------|--------|
| AD-1 | Dual wallet read | H2 | `4fba753c` |
| AD-2 | No shared read cache | H5 | `f239aae7` |
| AD-3 | Legacy direct transport | H4 | `792a5a70` |
| AD-6 | No route guard | H1 | `3cd748e1` |
| AD-8 | `#chat` / calendar dead links | H3 | `e369c25a` |
| AD-17 | No hub entry | H6 | `56495e38` |
| AD-12 | No ops runbook | H7 | docs + checklist |
| AD-22 | Mock AI disclosure | H7 | governance UI + release notes |
| AD-21 | Commerce disclaimer weak | H7 | governance UI |
| AD-23 | Enterprise mis-label | H7 | role meta + release notes |
| AD-15 | API strings in UI | H7 | empty state copy |
| AD-24 | SSOT registry missing | H7 | `TALENT-SSOT-LINK-REGISTRY.md` |

---

## Open — v1.1+ (non-blocking general prod)

| ID | Debt | Severity | Horizon | Notes |
|----|------|----------|---------|-------|
| AD-4 | Placeholder tabs (Work/Grow/Trust/Calendar/Profile) | Medium | v1.1 wraps | Relabeled H7; full wrap deferred |
| AD-5 | Satellite modules outside main nav | Low | IA pass | H6 shortcuts mitigate |
| AD-7 | Compose helper duplication | Low | Maintenance | D-4 in R5 backlog |
| AD-9 | Blueprint doc not version-pinned | Low | Docs | Platform governance |
| AD-10 | Shop-chat client duplication | Low | Maintenance | — |
| AD-13 | Role spoof via localStorage | Medium | F-2 Phase 2 | H7 disables hints in prod |
| AD-14 | Unread chip heuristic | Low | E-3 | Label accuracy |
| AD-16 | Guest vs Customer AI matrix | Low | A-3 | Policy alignment |
| AD-18 | Visibility refetch storm | Low | D-2 | Mitigated by H5 cache |
| AD-19 | Bundle not code-split | Low | D-3 | Performance backlog |
| AD-20 | Booking error key collision | Low | D-5 | Dev observability |

---

## Executive Conditions — closure map

| Condition | Status | Evidence |
|-----------|--------|----------|
| C1 Wallet SSOT | **Closed** | H2-REPORT · wallet adapter |
| C2 Route governance | **Closed** | H1-REPORT · TalentRouteGuard |
| C3 Deep links | **Closed** | H3-REPORT · talentTodayLinks |
| C4 Legacy transport | **Closed** | H4-REPORT · `/api/talent/read` |
| C5 Release comms | **Closed** | H7 release notes + UI disclosures |
| C6 Platform entry | **Closed** | H6-REPORT · hub matrix |
| C7 Scale plan | **Closed** | H5 cache + H7 TTL flag + checklist |

---

## Scale triggers (C7 ongoing)

| DAU milestone | Action |
|---------------|--------|
| 100k | Monitor cache hit rate; review TTL |
| 500k | Re-evaluate server-side read aggregation RFC |
| 1M | Code-split heavy modules (D-3); BFF read models |

Registered in [TALENT-OS-PRODUCTION-CHECKLIST.md](./TALENT-OS-PRODUCTION-CHECKLIST.md).

---

## Risk register (residual)

| Risk | Level | Mitigation |
|------|-------|------------|
| Client-only route guard | Medium | Documented; server auth unchanged |
| Mock AI marketing | Low | H7 banners + release notes |
| Placeholder over-expectation | Low | H7 relabel + release notes |
| Commerce mistaken for ledger | Low | H7 disclaimer |
| Enterprise oversell | Low | Preview copy |

---

## Next programs (out of H7 scope)

- Work / Trust / Profile **wrap** (feature program v1.1)
- AI Core provider swap via port
- Server-driven entitlements (F-2 Phase 2)
- Org / Enterprise workspace (v2 RFC)
