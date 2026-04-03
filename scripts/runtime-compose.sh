#!/usr/bin/env bash

set -euo pipefail

STACK="${1:-}"

if [[ "$STACK" != "dev" && "$STACK" != "test" ]]; then
  echo "usage: $0 <dev|test> <docker compose args...>" >&2
  exit 1
fi

shift

case "$STACK" in
  dev)
    export COMPOSE_PROJECT_NAME="${COMPOSE_PROJECT_NAME:-cogni-runtime-dev}"
    export COGNI_EDGE_NETWORK_NAME="${COGNI_EDGE_NETWORK_NAME:-cogni-edge}"
    ENV_FILE=".env.local"
    ;;
  test)
    export COMPOSE_PROJECT_NAME="${COMPOSE_PROJECT_NAME:-cogni-runtime-test}"
    export COGNI_EDGE_NETWORK_NAME="${COGNI_EDGE_NETWORK_NAME:-cogni-edge-test}"
    export INTERNAL_NETWORK_SUBNET="${INTERNAL_NETWORK_SUBNET:-10.101.0.0/24}"
    export TIGERBEETLE_INTERNAL_IP="${TIGERBEETLE_INTERNAL_IP:-10.101.0.100}"
    export TIGERBEETLE_ADDRESS_OVERRIDE="${TIGERBEETLE_ADDRESS_OVERRIDE:-10.101.0.100:3002}"
    export POSTGRES_HOST_PORT="${POSTGRES_HOST_PORT:-55433}"
    export LITELLM_HOST_PORT="${LITELLM_HOST_PORT:-14000}"
    export LOKI_HOST_PORT="${LOKI_HOST_PORT:-13100}"
    export GRAFANA_HOST_PORT="${GRAFANA_HOST_PORT:-13001}"
    export ALLOY_HOST_PORT="${ALLOY_HOST_PORT:-12346}"
    export TEMPORAL_HOST_PORT="${TEMPORAL_HOST_PORT:-17234}"
    export TEMPORAL_UI_HOST_PORT="${TEMPORAL_UI_HOST_PORT:-18234}"
    export SCHEDULER_WORKER_HOST_PORT="${SCHEDULER_WORKER_HOST_PORT:-19002}"
    export OPENCLAW_GATEWAY_HOST_PORT="${OPENCLAW_GATEWAY_HOST_PORT:-13334}"
    export TIGERBEETLE_HOST_PORT="${TIGERBEETLE_HOST_PORT:-13002}"
    export CADDY_HTTP_PORT="${CADDY_HTTP_PORT:-18080}"
    export CADDY_HTTPS_PORT="${CADDY_HTTPS_PORT:-18443}"
    export DATABASE_SERVICE_URL_DOCKER="${DATABASE_SERVICE_URL_DOCKER:-postgresql://app_service:service_password@postgres:5432/cogni_resy_helper_stack_test}"
    ENV_FILE=".env.test"
    ;;
esac

if [[ "${1:-}" != "down" ]]; then
  docker network create "$COGNI_EDGE_NETWORK_NAME" >/dev/null 2>&1 || true
fi

exec docker compose --env-file "$ENV_FILE" -f infra/compose/runtime/docker-compose.dev.yml "$@"
