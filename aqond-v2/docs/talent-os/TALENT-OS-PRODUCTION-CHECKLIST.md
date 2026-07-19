# Talent OS — Production Checklist

**Program:** H7 Enterprise Governance  
**Target:** General production launch  
**Gate:** R4 Executive Conditions C1–C7

---

## Pre-deploy (required)

### Environment

- [ ] `NEXT_PUBLIC_TALENT_OS_ENABLED=1`
- [ ] `NEXT_PUBLIC_TALENT_OS_BETA=1` (or `0` if beta comms complete)
- [ ] `NEXT_PUBLIC_TALENT_AI_MOCK=1` until AI Core provider live
- [ ] `NEXT_PUBLIC_TALENT_ROLE_HINTS=0` in production
- [ ] `NEXT_PUBLIC_TALENT_CACHE_TTL_MS=30000` (or approved override)
- [ ] Storefront proxy `/api/talent/read/*` reachable from prod (H4)
- [ ] Account wallet BFF `/v1/wallet` reachable (H2)

### Governance docs published

- [ ] [TALENT-OS-RELEASE-NOTES.md](./TALENT-OS-RELEASE-NOTES.md) — support + marketing
- [ ] [TALENT-SSOT-LINK-REGISTRY.md](./TALENT-SSOT-LINK-REGISTRY.md) — link owners
- [ ] [TALENT-OS-DEVELOPER-NOTES.md](./TALENT-OS-DEVELOPER-NOTES.md) — engineering

### UI disclosures visible

- [ ] Beta banner (when `BETA=1`)
- [ ] Role switcher disclaimer
- [ ] Mock AI banner on `/m/talent/ai`
- [ ] Commerce non-ledger disclaimer on `/m/talent/money`
- [ ] Notification read-only note
- [ ] Placeholder tabs show “เร็วๆ นี้” (no internal phase IDs)
- [ ] No `/api/` or fetch function names in user-facing empty states

---

## Executive Conditions sign-off

| # | Condition | Hardening | Verified |
|---|-----------|-----------|----------|
| **C1** | Wallet SSOT | H2 | [ ] QA parity Today/Money vs Account wallet |
| **C2** | Route–role governance | H1 | [ ] Customer cannot open `/m/talent/money` via URL |
| **C3** | Deep link integrity | H3 | [ ] No `#chat`; calendar links → booking |
| **C4** | Legacy read transport | H4 | [ ] Reads via `/api/talent/read/*` only |
| **C5** | Release comms | H7 | [ ] Release notes + in-app disclosures |
| **C6** | Platform entry | H6 | [ ] Reachable from Services/Account without URL |
| **C7** | Scale plan | H5 + H7 | [ ] 30s cache registered; TTL env documented |

---

## Smoke test matrix (QA)

| Persona | Test | Expected |
|---------|------|----------|
| Guest | Services hub → Talent | Today + discover guide |
| Guest | Direct `/m/talent/money` | Login redirect |
| Verified | Today → Notifications | Inbox loads via proxy |
| Provider | Money tab | Commerce + wallet matches Account |
| Customer | Direct `/m/talent/money` | 403 denied |
| Employer | Today shortcuts | Search/Notif/Timeline/Chat |
| All | AI tab | Mock banner visible |

---

## Rollback

1. Set `NEXT_PUBLIC_TALENT_OS_ENABLED=0` — hides hub tiles (if wired)
2. Remove Services/Account hub links (revert H6) if needed
3. Restore direct legacy reads only if proxy failure (document incident)

---

## Post-launch monitoring

- [ ] Wallet parity spot-check (daily first week)
- [ ] 401/403 guard redirects (no flash of forbidden content)
- [ ] `/api/talent/read/*` error rate < baseline
- [ ] Cache hit ratio / duplicate fetch reduction (H5)
- [ ] Support tickets tagged `talent-os-v1`

---

## Sign-off

| Role | Name | Date | Signature |
|------|------|------|-----------|
| Product | | | |
| Platform / QA | | | |
| Security | | | |
| Executive Architect | | | |

**Decision target:** APPROVED FOR GENERAL PRODUCTION
