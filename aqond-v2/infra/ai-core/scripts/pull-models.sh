#!/bin/bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
ENV_FILE="${ENV_FILE:-$ROOT/infra/.env}"
if [[ -f "$ENV_FILE" ]]; then set -a; source "$ENV_FILE"; set +a; fi

PROFILE="${OLLAMA_PROFILE:-lite}"
if [[ "$PROFILE" == "standard" ]]; then
  CHAT="${OLLAMA_MODEL_CHAT:-hermes3:8b}"
  VISION="${OLLAMA_MODEL_VISION:-llava:7b}"
else
  CHAT="${OLLAMA_MODEL_CHAT:-hermes3:3b}"
  VISION="${OLLAMA_MODEL_VISION:-moondream}"
fi

echo "Profile: $PROFILE"
echo "  chat:   $CHAT (~2GB lite / ~4.7GB standard)"
echo "  vision: $VISION (~1.8GB moondream / ~4.7GB llava)"
echo ""

pull_one() {
  local model="$1"
  echo ">>> ollama pull $model"
  docker compose --env-file "$ENV_FILE" -f "$ROOT/docker-compose.yml" exec -T ollama ollama pull "$model" || {
    echo "WARN: failed to pull $model — verify tag at https://ollama.com/library/hermes3"
    return 1
  }
}

pull_one "$CHAT"
pull_one "$VISION"

docker compose --env-file "$ENV_FILE" -f "$ROOT/docker-compose.yml" exec -T ollama ollama list
echo "Done."
