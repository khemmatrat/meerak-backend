# AQOND — Coding Standards

**Last Updated:** 2026-06-29  
Extracted from repository conventions.

---

## Folder Structure

| Area | Convention |
|------|------------|
| Legacy backend | `backend/lib/<domain>/`, `backend/routes/`, `backend/db/migrations/` |
| Storefront | Next.js App Router: `app/`, `components/`, `lib/server/` for server-only |
| Go services | `aqond-v2/services/<name>-svc/main.go` |
| AIVOS | `backend/lib/aivos/<module>/` — phases numbered, no breaking prior phases |
| Tests | `backend/__tests__/`, `*.test.js` adjacent to modules |
| Docs | `docs/` DOS + preserved historical `.txt` / `.md` |

---

## Naming

| Type | Convention | Example |
|------|------------|---------|
| API routes | kebab-case paths | `/api/merchant/ad-video` |
| Job IDs | prefix by module | `mad-*` (merchant-ad), `adv-*` (legacy local) |
| Env flags | `AIVOS_*_ENABLED=1` | `AIVOS_MERCHANT_AD_GROK_VIDEO=1` |
| Migrations | `NNN_description.sql` | `260_ai_runtime_semantic.sql` |
| React components | PascalCase | `MerchantAdStudioClient.tsx` |
| Server modules | camelCase files | `merchantCatalog.ts` |
| Go packages | short service name | `food-svc` |

---

## Error Handling

- Backend: Express `try/catch` with JSON `{ error, message }` responses
- Storefront API routes: `NextResponse.json({ error }, { status })`
- AIVOS: guard middleware on merchant-ad routes; 503 when runtime disabled
- Never swallow errors in payment/wallet paths — log + audit

---

## API Convention

- Legacy: `/api/<domain>/<action>`
- Storefront BFF: `/api/bff/v1/<resource>`
- Storefront domain APIs: `/api/<domain>/...` (merchant, cart, checkout)
- Auth: Firebase session / cookies for storefront; admin routes require admin role
- Dev-only headers documented in DECISIONS (e.g. `X-Aivos-Merchant-Ad-Key`)

---

## Database Convention

- Schema changes only via numbered SQL migrations
- Never edit applied migrations — add new file
- JSON `.data` stores for dev-only fallback (document in DOS)
- FK columns: `<entity>_id`
- Audit tables for financial events

---

## Architecture Rules

1. **AIVOS phases are additive** — Phase 21 (merchant-ad) must not break Phases 1–20
2. **Storefront server logic in `lib/server/`** — not in React components
3. **Prefer proxy to backend** over duplicating AIVOS logic in storefront
4. **Local catalog is dev fallback** — production targets catalog-svc
5. **Documentation append-only** — never delete historical DOS entries
6. **Reuse shared services** — paymentManager, s3-client, homeProducts before new modules

---

## Testing

- Backend: Node test files `backend/__tests__/aivos*.test.js`
- Merchant-ad suite: MAD01–MAD11
- Run backend tests after AIVOS changes with server env flags set
