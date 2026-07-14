# AQOND Marketplace v2 — Greenfield Stack

Separate from production AQOND (`meerak/` Node backend, mobile, Social Core).
Zero-SaaS marketplace stack: Kong, Bagisto placeholder, LiveKit, voice AI stub, n8n, lightweight notify/analytics.

## Quick start

```bash
cd aqond-v2
cp infra/.env.example infra/.env
# Edit infra/.env — rotate ALL secrets
cp infra/.env .env   # required for docker compose variable interpolation

docker compose --env-file infra/.env up -d aqond-db aqond-redis
bash infra/scripts/apply-migrations.sh
docker compose --env-file infra/.env up -d --build
bash infra/scripts/health-check.sh
```

Or: `make env && make migrate && make up`

## Ports (host)

| Service | Port | Notes |
|---------|------|-------|
| Kong proxy | 8000 | Public API gateway |
| Kong admin | 127.0.0.1:8001 | Internal only |
| Postgres | 5433 | Avoids clash with meerak :5432 |
| LiveKit | 7880 | WebRTC |
| Voice | 8090 HTTP, 8091 WS | Hertz-dev PoC |

## Phases

- P0 Foundation — Postgres multi-DB, compose, secrets, migrations
- P1 Kong — DB-less routes, JWT, rate-limit, key-auth, admin locked
- P2 Marketplace — Escrow ledger + triggers, tier billing, Bagisto placeholder
- P3 CMS — AI onboard endpoint, idempotent Bagisto webhook sync
- P4 LiveKit — token service + F-Code product overlay
- P5 Voice — Hertz-dev WebSocket PoC with barge-in
- P6 Automation — n8n + 48h SLA workflow + notify service
- P7 Analytics — Postgres-lite events + CrewAI rank endpoint

See `gateway/README.md` for route map.

## P8 Hermes AI Core

Local LLM via Ollama — no OpenAI/Anthropic dependency.

```bash
docker compose --env-file infra/.env up -d ollama ai-core
powershell -ExecutionPolicy Bypass -File infra/ai-core/scripts/pull-models.ps1
powershell -ExecutionPolicy Bypass -File infra/scripts/apply-migrations.ps1
docker compose --env-file infra/.env up -d --force-recreate kong cms-service ai-core
```

| Endpoint | Purpose |
|----------|---------|
| GET /api/v1/ai/health | Ollama + ai-core status |
| POST /api/v1/cms/ai/onboard | Merchant onboarding (multipart image) |

Header: X-AI-Core-Api-Key (match AI_CORE_API_KEY in infra/.env and gateway/kong.yml)

CPU PoC: 30-120s per product. Production: set OLLAMA_HOST to GPU server — see infra/ai-core/docs/CPU-GPU-PROFILES.md
