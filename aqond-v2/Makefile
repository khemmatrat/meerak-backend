.PHONY: env up down migrate health build logs

env:
	@test -f infra/.env || cp infra/.env.example infra/.env
	cp infra/.env .env

up: env
	docker compose --env-file infra/.env up -d --build

down:
	docker compose --env-file infra/.env down

migrate: env
	bash infra/scripts/apply-migrations.sh

health:
	bash infra/scripts/health-check.sh

build: env
	docker compose --env-file infra/.env build

logs:
	docker compose --env-file infra/.env logs -f --tail=100
