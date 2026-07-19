# TOS-3 Implementation Report — Role Context Layer

**Phase:** TOS-3 · **Date:** 2026-07-19 · **Status:** Complete

## Charter

Presentation-only **Role Context Layer** — workspace switch, permission mapping, context badge. No backend, DB, or API changes.

Reference: [11-TALENT-OS-BLUEPRINT.md](./11-TALENT-OS-BLUEPRINT.md) §6 Role Evolution

## Roles

| Role | Availability (client resolver) |
|------|--------------------------------|
| **Guest** | Not logged in |
| **Verified** | Logged in (default) |
| **Provider** | `user.role=provider` or local `aqond_talent_provider_status_v1=VERIFIED_PROVIDER` |
| **Employer** | Logged in (hire workspace) |
| **Customer** | Logged in (book workspace) |
| **Enterprise** | `user.role=enterprise` or `aqond_pro_tier_v1=enterprise` |

## Deliverables

| Item | Path |
|------|------|
| Role types + meta | `lib/talent/talentRoleTypes.ts` |
| Role resolver | `lib/talent/talentRoleResolver.ts` |
| Permission mapping | `lib/talent/talentRolePermissions.ts` |
| React context | `lib/talent/TalentRoleContext.tsx` |
| Context badge | `components/talent/TalentRoleBadge.tsx` |
| Workspace switch | `components/talent/TalentRoleSwitcher.tsx` |
| Workspace root | `components/talent/TalentWorkspaceRoot.tsx` |

## Behaviour

- **Active role** persisted in `localStorage` key `aqond_talent_role_context_v1`
- **Nav tabs** filtered via `filterTalentNavForRole(activeRole)`
- **Today sections** filtered via `isTalentTodaySectionVisible(activeRole, section)`
- **Summary chips** filtered via `isTalentSummaryChipVisible`
- Switching role does **not** call backend — UI filter only

## Permission examples

| Role | Hidden nav | Hidden Today sections |
|------|------------|----------------------|
| Guest | Money, Trust, Calendar | All data (login prompt) |
| Employer | Grow, Trust | Match, Board, Reviews |
| Customer | Money, Grow, Trust | Match, Board, Wallet, Reviews |
| Provider | — | — (work-focused, all provider sections) |

## Scope compliance

| Rule | Result |
|------|--------|
| No backend change | ✅ |
| No DB change | ✅ |
| No API change | ✅ |
| Presentation only | ✅ |
| Role switching works | ✅ Switcher + persisted context |
| No existing feature broken | ✅ Changes scoped to `/m/talent/*` |

## Acceptance

- Role switcher visible when ≥2 roles available
- Badge in header + Today page
- TOS-1/TOS-2 routes unchanged outside talent shell

**STOP FOR REVIEW**
