# AQOND Documentation Operating System (DOS)

**Last Updated:** 2026-06-29
**Current Development Phase:** Sprint — Merchant Ad Video + Storefront Commerce Integration
**Documentation Version:** 1.0.0

---

## Project Overview

AQOND (repository: `meerak`) is a multi-product commerce and services platform spanning:

- **Core mobile shell** (`mobile/`) — jobs, bookings, wallet, video feed
- **Storefront v2** (`aqond-v2/apps/storefront/`) — marketplace, food, merchant back-office, live commerce
- **Legacy backend** (`backend/server.js`) — monolith API, payments, wallet, courses, AIVOS
- **AIVOS** (`backend/lib/aivos/`) — AI runtime, workflows, merchant ad video, billing
- **Microservices** (`aqond-v2/services/`) — Go services behind Kong BFF
- **Admin** (`nexus-admin-core/`, `ads-admin-core/`)
- **AI media factory** (`aqond-brain/`) — offline Python pipelines

The DOS is the **permanent project memory**. AI agents and developers must read documentation before scanning code.

> Historical monorepo facts: see [AQOND-DOS.md](./AQOND-DOS.md) (preserved, do not delete).

---

## Current Sprint

**Focus:** Merchant Ad Video Studio — Grok video generation, product publish pipeline, home catalog visibility.

| Area | Status |
|------|--------|
| AIVOS merchant-ad backend (Grok per-shot) | Operational (dev) |
| Storefront Ad Studio UX | Background jobs, product form, publish |
| Product → Home catalog sync | Fixed affiliate overwrite bug |
| PDP video / mock Live rail | In progress |
| Production Grok path hardening | Pending ops restart verification |

---

## Documentation Navigation

| Document | Purpose |
|----------|---------|
| [MASTER_BLUEPRINT.md](./MASTER_BLUEPRINT.md) | Full platform architecture |
| [KNOWLEDGE_INDEX.md](./KNOWLEDGE_INDEX.md) | AI memory — module lookup |
| [CURRENT_STATUS.md](./CURRENT_STATUS.md) | **Start here** — today's state |
| [ROADMAP.md](./ROADMAP.md) | Past, present, future work |
| [DECISIONS.md](./DECISIONS.md) | Architectural decision log |
| [API_CATALOG.md](./API_CATALOG.md) | API index |
| [DATABASE_SCHEMA.md](./DATABASE_SCHEMA.md) | Tables and storage |
| [DEPENDENCY_GRAPH.md](./DEPENDENCY_GRAPH.md) | Module dependencies |
| [MODULE_MAP.md](./MODULE_MAP.md) | Per-module entry points |
| [CODING_STANDARDS.md](./CODING_STANDARDS.md) | Conventions |
| [REGRESSION_STATUS.md](./REGRESSION_STATUS.md) | Test / regression tracking |

### Engineering Logs

| Type | Location |
|------|----------|
| Daily | [engineering-log/daily/](./engineering-log/daily/) |
| Weekly | [engineering-log/weekly/](./engineering-log/weekly/) |
| Monthly | [engineering-log/monthly/](./engineering-log/monthly/) |

### Architecture Artifacts

| Location | Purpose |
|----------|---------|
| [architecture/](./architecture/) | Diagrams, deep dives |
| [reports/](./reports/) | Phase reports, audits |
| [images/](./images/) | Architecture screenshots |

---

## Latest Engineering Log

→ [engineering-log/daily/2026-06-29.md](./engineering-log/daily/2026-06-29.md)

---

## Start-of-Day Workflow (Required)

Read in order:

1. `README.md` (this file)
2. `CURRENT_STATUS.md`
3. `MASTER_BLUEPRINT.md` (skim relevant sections)
4. `KNOWLEDGE_INDEX.md` (locate task modules only)
5. `DECISIONS.md` (recent entries)
6. Latest daily engineering log

**Do not** full-repo scan until documentation is read.

---

## End-of-Day Workflow (Required)

1. Analyze today's changes
2. Update `MASTER_BLUEPRINT.md` if architecture changed
3. Update `KNOWLEDGE_INDEX.md` for new modules
4. Update `CURRENT_STATUS.md`
5. Update `ROADMAP.md` if milestones shifted
6. Append to `DECISIONS.md` for new decisions
7. Update `API_CATALOG.md` / `DATABASE_SCHEMA.md` if applicable
8. Update `DEPENDENCY_GRAPH.md` if relationships changed
9. Create **new** daily log (never overwrite)
10. Update `REGRESSION_STATUS.md`
11. Set tomorrow's recommended tasks in daily log

---

## AI Optimization Rules

- Use `KNOWLEDGE_INDEX.md` to find files — avoid whole-repo search
- Read only modules related to the current task
- Reuse existing services before creating new ones
- Never delete historical documentation — append only
- Documentation is source-of-truth for project status


# AQOND Documentation Operating System (AQOND-OS)

**Last Updated:** 2026-06-30
**Documentation Version:** 1.0.0
**Workspace:** `docs/aqond-os/` — **the ONLY official documentation workspace for AI during development**

---

## Objective

AQOND-OS is the permanent project memory for the AQOND/meerak monorepo. A new AI session must understand the entire project by reading **only this folder** before touching source code.

> **Do not** scan unrelated files under `docs/`. Historical monorepo facts live in [`../AQOND-DOS.md`](../AQOND-DOS.md) — reference via [KNOWLEDGE_INDEX.md](./KNOWLEDGE_INDEX.md) only when needed.

---

## Project Overview

AQOND (repository: `meerak`) is a multi-product commerce and services platform:

| Product | Path | Doc |
|---------|------|-----|
| Services (mobile core) | `mobile/` | [products/services.md](./products/services.md) |
| Food | `aqond-v2/services/food-svc/` | [products/food.md](./products/food.md) |
| Market / Storefront | `aqond-v2/apps/storefront/` | [products/market.md](./products/market.md) |
| Brain (AI media) | `aqond-brain/` | [products/brain.md](./products/brain.md) |
| Pay (wallet/payments) | `backend/`, `payment-svc/` | [products/pay.md](./products/pay.md) |
| Admin | `nexus-admin-core/`, `ads-admin-core/` | [products/admin.md](./products/admin.md) |

Shared backend: `backend/server.js` (Express monolith, port **3001**).  
AIVOS AI platform: `backend/lib/aivos/`.  
v2 microservices: `aqond-v2/services/` (Go, Kong BFF).

---

## AI Reading Rules (Required — Start of Every Session)

### Before writing code (minimal resume set)

1. [SESSION.md](./SESSION.md) — **live working memory; resume from Resume Point**
2. [CURRENT_STATUS.md](./CURRENT_STATUS.md)
3. [NEXT_TASK.md](./NEXT_TASK.md)

If SESSION.md exists: **do NOT** restart project analysis or rediscover completed work.  
Only open additional files when SESSION.md or the Knowledge Index requires it.

### Full context (first session or architecture work)

4. [README.md](./README.md) (this file)
5. [MASTER_BLUEPRINT.md](./MASTER_BLUEPRINT.md) (skim relevant sections)
6. [KNOWLEDGE_INDEX.md](./KNOWLEDGE_INDEX.md) (locate task modules only)
7. [DECISIONS.md](./DECISIONS.md) (recent entries)
8. Latest file in [logs/daily/](./logs/daily/)

**Do NOT** scan unrelated markdown under `docs/` unless explicitly referenced by the Knowledge Index.

---

## Documentation Priority (Source of Truth)

| File | Role |
|------|------|
| SESSION.md | **Live working memory** — current session; overwritten during dev |
| README.md | Entry point, rules |
| CURRENT_STATUS.md | Today's state |
| MASTER_BLUEPRINT.md | Architecture |
| KNOWLEDGE_INDEX.md | AI navigation map |
| DECISIONS.md | Architectural decisions |
| NEXT_TASK.md | Tomorrow's starting point |

If documentation and code differ, **report the inconsistency** before making changes.

---

## SESSION.md Rules

- **One file only:** `docs/aqond-os/SESSION.md`
- **During development:** update continuously (progress, working files, resume point, regression)
- **Before writing code:** read SESSION.md; resume from Resume Point
- **End of session:** finalize SESSION.md, then sync to other docs below

## Documentation Maintenance (After Every Completed Task)

0. Update [SESSION.md](./SESSION.md) — progress, resume point, regression checklist
1. Update [CURRENT_STATUS.md](./CURRENT_STATUS.md)
2. Update [MASTER_BLUEPRINT.md](./MASTER_BLUEPRINT.md) if architecture changed
3. Update [KNOWLEDGE_INDEX.md](./KNOWLEDGE_INDEX.md)
4. Update [API_CATALOG.md](./API_CATALOG.md) if APIs changed
5. Update [DATABASE_SCHEMA.md](./DATABASE_SCHEMA.md) if database changed
6. Update [DEPENDENCY_GRAPH.md](./DEPENDENCY_GRAPH.md) if dependencies changed
7. Update [MODULE_MAP.md](./MODULE_MAP.md) if modules changed
8. Update [DECISIONS.md](./DECISIONS.md) if architectural decisions were made
9. Update [NEXT_TASK.md](./NEXT_TASK.md)
10. Generate a **new** daily log in [logs/daily/](./logs/daily/) (append-only, never overwrite)

---

## Navigation

| Document | Purpose |
|----------|---------|
| [MASTER_BLUEPRINT.md](./MASTER_BLUEPRINT.md) | Full platform architecture |
| [KNOWLEDGE_INDEX.md](./KNOWLEDGE_INDEX.md) | Module lookup — use before scanning code |
| [CURRENT_STATUS.md](./CURRENT_STATUS.md) | **Start here** — today's state |
| [NEXT_TASK.md](./NEXT_TASK.md) | Current sprint task card |
| [ROADMAP.md](./ROADMAP.md) | Past, present, future work |
| [DECISIONS.md](./DECISIONS.md) | Architectural decision log |
| [API_CATALOG.md](./API_CATALOG.md) | API index |
| [DATABASE_SCHEMA.md](./DATABASE_SCHEMA.md) | Tables and storage |
| [DEPENDENCY_GRAPH.md](./DEPENDENCY_GRAPH.md) | Module dependencies |
| [MODULE_MAP.md](./MODULE_MAP.md) | Per-module entry points |
| [CODING_STANDARDS.md](./CODING_STANDARDS.md) | Conventions |
| [REGRESSION_STATUS.md](./REGRESSION_STATUS.md) | Test / regression tracking |

### Products

[products/services.md](./products/services.md) · [products/food.md](./products/food.md) · [products/market.md](./products/market.md) · [products/brain.md](./products/brain.md) · [products/pay.md](./products/pay.md) · [products/admin.md](./products/admin.md)

### Logs & Artifacts

| Type | Location |
|------|----------|
| Daily | [logs/daily/](./logs/daily/) |
| Weekly | [logs/weekly/](./logs/weekly/) |
| Monthly | [logs/monthly/](./logs/monthly/) |
| Archive | [logs/archive/](./logs/archive/) |
| Reports | [reports/](./reports/) |
| Architecture | [architecture/](./architecture/) |
| Diagrams | [diagrams/](./diagrams/) |

---

## Performance Optimization

- Use [KNOWLEDGE_INDEX.md](./KNOWLEDGE_INDEX.md) first — never scan the whole repository if the index identifies the correct files
- Analyze only relevant source code for the current task
- Minimize token consumption

---

## Latest Daily Log

→ [logs/daily/2026-06-30.md](./logs/daily/2026-06-30.md)
