# Talent OS v1 — Release Notes

**Version:** 1.0.0-h7  
**Date:** 2026-07-19  
**Status:** General production authorized (Executive Conditions C1–C7 closed)

---

## What is Talent OS?

Talent OS is AQOND’s **Experience Layer** for talent/workforce users. It **aggregates and deep-links** into existing platform owners — Services (Match, Board, Booking), Account (wallet), Marketplace chat — without replacing them.

**Route:** `/m/talent`

---

## How to reach Talent OS

| Entry | Path |
|-------|------|
| Services hub | Featured **Talent OS** card |
| Services header | ✨ icon |
| Account | Service row + menu |
| Onboarding | **Talent OS** intent |
| Marketplace welcome | Overlay tile |
| Guest Today | Platform discover guide |

---

## What works today (live modules)

| Module | Route | Notes |
|--------|-------|-------|
| **Today** | `/m/talent` | Aggregated dashboard |
| **Money / Commerce** | `/m/talent/money` | Client-composed metrics — **approximate, not ledger** |
| **Notifications** | `/m/talent/notifications` | **Read-only inbox** — push settings in Account |
| **Search** | `/m/talent/search` | Client index over existing reads |
| **Timeline** | `/m/talent/timeline` | Chronological compose |
| **Chat index** | `/m/talent/chat` | Deep links only — no merged chat backend |
| **AI Workspace** | `/m/talent/ai` | **Mock provider — no LLM** |

---

## Placeholder tabs (coming soon)

These tabs show **“เร็วๆ นี้”** with deep links to existing Services/Account pages:

- Work · Grow · Trust · Calendar · Profile

Do **not** market these as fully shipped features.

---

## Important disclosures (required reading)

### Mock AI

AI Workspace uses a **mock adapter** (`TalentAiIntegrationPort`). Outputs are **demonstration only**. No LLM, vector, or AI Core calls occur until a governed provider is registered.

**Flag:** `NEXT_PUBLIC_TALENT_AI_MOCK=1` (default)

### Commerce Intelligence

Money tab figures are **client-composed estimates** from existing reads. They are **not** payout ledgers or financial SSOT. Confirm balances at **Account → Wallet**.

### Notifications

Notification Center is a **read-only feed**. It does not replace push notification settings (`/m/account`).

### Workspace roles

Role switcher (Guest, Provider, Employer, etc.) is a **UI lens only** — not server entitlements. Production builds disable localStorage role hints unless `NEXT_PUBLIC_TALENT_ROLE_HINTS=1`.

### Enterprise role

Enterprise workspace is **preview positioning** — no org admin, multi-seat, or SSO in v1.

---

## Beta controls

| Flag | Default | Effect |
|------|---------|--------|
| `NEXT_PUBLIC_TALENT_OS_ENABLED` | `1` | Master enable / rollback |
| `NEXT_PUBLIC_TALENT_OS_BETA` | `1` | Beta banner in workspace |
| `NEXT_PUBLIC_TALENT_AI_MOCK` | `1` | Mock AI disclosure |
| `NEXT_PUBLIC_TALENT_ROLE_HINTS` | off in prod | Client role expansion hints |
| `NEXT_PUBLIC_TALENT_CACHE_TTL_MS` | `30000` | Shared read cache TTL |

Set `NEXT_PUBLIC_TALENT_OS_BETA=0` when removing beta banner after launch comms.

---

## Hardening included (H1–H7)

| Program | Summary |
|---------|---------|
| H1 | Route guards — nav ⊆ URL access |
| H2 | Wallet SSOT via Account BFF |
| H3 | Deep link integrity (no `#chat`, calendar → booking) |
| H4 | Legacy reads via `/api/talent/read/*` proxy |
| H5 | 30s shared read cache + in-flight dedupe |
| H6 | Platform discoverability (Services, Account, onboarding) |
| H7 | Release governance, flags, disclosures, production checklist |

---

## Support macros

**User:** “Why doesn’t AI give real answers?”  
**Reply:** Talent OS AI is mock-only in v1. Real AI requires AI Core provider registration per platform governance.

**User:** “Wallet on Today doesn’t match payout.”  
**Reply:** Today/Money shows composed estimates. Official balance is Account → Wallet (SSOT).

**User:** “I switched to Enterprise but no team features.”  
**Reply:** Enterprise is preview workspace UI only in v1. Contact sales for org features.

---

## References

- [TOS-R4 Executive Sign-off](./TOS-R4-EXECUTIVE-SIGNOFF.md)
- [TALENT-OS-PRODUCTION-CHECKLIST.md](./TALENT-OS-PRODUCTION-CHECKLIST.md)
- [TALENT-OS-DEVELOPER-NOTES.md](./TALENT-OS-DEVELOPER-NOTES.md)
- [H7-REPORT.md](./H7-REPORT.md)
