# Kong Gateway (P1)

DB-less declarative mode. Config: kong.yml.

## Security

- Admin API bound to 127.0.0.1:8001 only — never expose publicly.
- JWT on /api/v1/marketplace/* — issuer aqond-jwt-issuer; secret matches KONG_JWT_SECRET in infra/.env.
- Key-auth on /api/v1/escrow/* via X-Escrow-Api-Key.
- Rate limiting: global 600/min + marketplace 300/min.

## Routes

See docker-compose upstream names in kong.yml.
