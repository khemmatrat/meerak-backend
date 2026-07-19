# Talent OS — Developer Notes

**Audience:** Storefront engineers · Platform · DevOps  
**SSOT code:** `lib/talent/` · `components/talent/` · `hooks/talent/`

---

## Architecture charter

Talent OS is **presentation-only**:

- No new domain API or database
- No business logic rewrite
- Wrap Services / Account / Marketplace — aggregate + deep link

```
app/m/talent/*          → pages
components/talent/*     → UI
lib/talent/*            → compose, sources, adapters, governance
hooks/talent/*          → data hooks (cached loaders)
```

---

## Read paths (post H4/H5)

| Data | Client path | Owner |
|------|-------------|-------|
| Wallet | `bffGet /v1/wallet` via `talentWalletAdapter` | Account / wallet-svc |
| Notifications | `/api/talent/read/notifications/latest` | Legacy (proxied) |
| Reviews | `/api/talent/read/reviews/worker/:id` | Legacy (proxied) |
| Match/Board/Booking | Services clients | Services OS |
| Shop chat inbox | Existing shop-chat BFF | Marketplace |

**Do not** add `meerakLegacyUrl()` in new Talent reads.

---

## Feature flags

SSOT: `lib/talent/talentReleaseGovernance.ts`

```typescript
isTalentOsEnabled()      // master switch
isTalentOsBeta()         // beta banner
isTalentAiMockMode()     // mock AI disclosure
isTalentRoleHintsEnabled() // localStorage provider/enterprise hints
talentDataCacheTtlMs()   // cache override
```

Documented in `.env.example` under Talent OS section.

---

## Route guard

`TalentRouteGuard` + `talentRolePermissions.ts` — client-only; maps all 12 `/m/talent/*` routes.

Sensitive: Money, AI, Trust — login + permission required.

---

## Cache layer (H5)

- `lib/talent/cache/talentDataCache.ts` — TTL + in-flight dedupe
- `lib/talent/cache/talentRawLoaders.ts` — profile keys: today, search, commerce, chat, notifications
- `hooks/talent/useTalentRawData.ts` — shared hook

Default TTL: 30s (`TALENT_DATA_CACHE_TTL_MS`).

---

## Deep links

SSOT: `lib/talent/talentTodayLinks.ts`

- Match: `/m/services/match/:id` (no `#chat`)
- Calendar compose links → `/m/services/booking/mine`
- Wallet → `/m/account/wallet`

Full registry: [TALENT-SSOT-LINK-REGISTRY.md](./TALENT-SSOT-LINK-REGISTRY.md)

---

## AI integration

Port: `TalentAiIntegrationPort` (`lib/talent/talentAiTypes.ts`)  
Provider: `createTalentAiMockProvider()` until AI Core registers.

Swap provider in `TalentAiContext.tsx` — **no workspace redesign**.

---

## Discoverability (H6)

SSOT: `lib/talent/talentDiscoverability.ts`

Hub entries: Services, Account, onboarding, welcome overlay.

---

## Governance UI (H7)

| Component | Purpose |
|-----------|---------|
| `TalentBetaBanner` | Beta cohort disclosure |
| `TalentGovernanceNotice` | Inline warnings (commerce, AI, notif, role) |

Copy SSOT: `TALENT_GOVERNANCE_COPY` in `talentReleaseGovernance.ts`

---

## Adding a new Talent module (rules)

1. Read via existing platform APIs or `/api/talent/read/*` proxy only
2. Compose in `lib/talent/<module>/` — pure client aggregation
3. Deep link to SSOT owner — do not duplicate workflows
4. Register route in `talentRolePermissions.ts`
5. Use shared cache loader if overlapping sources
6. Update SSOT link registry doc

---

## Phase reports

| Phase | Report |
|-------|--------|
| TOS-1~10 | `TOS-*-REPORT.md` |
| H1~H7 | `H*-REPORT.md` |
| Gates | `TOS-R1` … `TOS-R5` |

---

## Local dev

```bash
# storefront
cd aqond-v2/apps/storefront
npm run dev
```

Open `/m/talent` — role hints enabled in dev by default.

---

## Out of scope for v1

- Server-driven entitlements (F-2 Phase 2)
- Work/Trust/Profile full wraps
- Real AI Core provider
- Org / Enterprise workspace product
