# FOOD_OS_CHANGE_POLICY

**Applies to:** All changes after tag `food-os-v1.0.0-baseline`

---

## Allowed without PO escalation

| Change type | Example |
|-------------|---------|
| Additive endpoint | `POST /api/disputes/[id]/notes` |
| Additive event (v1 catalog extension) | New type in `lifecycleEventTypes.ts` + ADR |
| Additive projection field | Track OS read model enrichment |
| Additive migration | `050_fairplay_hook_column.sql` (nullable) |
| Bug fix | Incorrect status code, crash, security patch |
| Documentation | Clarifications only |
| Performance | No semantic change |

---

## Forbidden without Architecture Review + PO approval

| Change type | Reason |
|-------------|--------|
| Breaking API response shape | Breaks frozen clients |
| Removing lifecycle event type | Breaks FairPlay replay |
| Changing lifecycle semantics | e.g. confirm before delivered |
| Moving Track OS ownership | SSOT violation |
| Moving Claim settlement authority | Financial/compliance risk |
| Direct UI → FairPlay coupling | Architecture boundary |
| Hidden state change without event | Control flow violation |

---

## Track OS

- **Read-only** for all admin/customer widgets
- Changes to `trackOsProjection.ts` must be **additive enrichment** only
- No business rules in `TrackOsDetailPanel.tsx` or customer track pages

---

## Claim OS

- Settlement, refund, replace, redispatch, escalate, close — **only** via frozen Claim APIs
- No duplicate dispute modules

---

## FairPlay boundary

- FairPlay **must not** modify Food workflow
- FairPlay consumes events; emits `fairplay.*` namespace only

---

## Process

1. Propose change in ADR or ticket
2. Architect review against this policy
3. If forbidden category → STOP + Conflict Report
4. If additive → implement + extend `test:release-gate`
