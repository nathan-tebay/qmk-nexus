#!/usr/bin/env bash
set -euo pipefail

COMPOSE="podman compose -f docker/docker-compose.yml"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

usage() {
  cat <<EOF
Usage: $(basename "$0") <command>

Commands:
  dev           Start frontend + backend in dev mode (hot reload)
  build         Build all Docker images
  up            Start full stack in background
  down          Stop all containers
  logs          Tail logs from all containers
  builder       Build the firmware builder image only
  backend       Start backend only
  frontend      Start frontend only
  build-proxy   Start local build proxy server (replaces Lambda for dev)
  clean         Remove all containers, images, volumes for this project
  help          Show this message
EOF
}

check_env() {
  if [[ ! -f "$ROOT/backend/.env" ]]; then
    echo "⚠  backend/.env not found — copying from .env.example"
    cp "$ROOT/backend/.env.example" "$ROOT/backend/.env"
    echo "   Fill in GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET before using auth."
  fi
}

case "${1:-help}" in
  dev)
    check_env
    echo "Starting dev stack (hot reload)..."
    $COMPOSE up --build frontend backend
    ;;
  build)
    echo "Building all images..."
    $COMPOSE build
    $COMPOSE --profile build build builder
    ;;
  builder)
    echo "Building firmware builder image..."
    $COMPOSE --profile build build builder
    ;;
  up)
    check_env
    echo "Starting build proxy in background..."
    BUILD_IMAGE="${BUILD_IMAGE:-qmk-nexus-builder}" \
    BUILDS_ROOT="${BUILDS_ROOT:-/tmp/tebay-builds}" \
    DEV_SERVER_PORT="${DEV_SERVER_PORT:-8080}" \
    BIND_HOST="${BIND_HOST:-0.0.0.0}" \
    python3 "$ROOT/docker/builder/server.py" &
    echo $! > /tmp/tebay-build-proxy.pid
    echo "Build proxy: http://localhost:${DEV_SERVER_PORT:-8080}"

    echo "Starting stack in background..."
    $COMPOSE up -d --build frontend backend
    echo "Frontend: http://localhost:3001"
    echo "Backend:  http://localhost:8000"
    echo "API docs: http://localhost:8000/docs"
    ;;
  down)
    if [[ -f /tmp/tebay-build-proxy.pid ]]; then
      echo "Stopping build proxy..."
      kill "$(cat /tmp/tebay-build-proxy.pid)" 2>/dev/null || true
      rm -f /tmp/tebay-build-proxy.pid
    fi
    $COMPOSE down
    ;;
  logs)
    $COMPOSE logs -f
    ;;
  backend)
    check_env
    $COMPOSE up --build backend
    ;;
  frontend)
    $COMPOSE up --build frontend
    ;;
  build-proxy)
    echo "Starting local build proxy on http://localhost:${DEV_SERVER_PORT:-8080} ..."
    BUILD_IMAGE="${BUILD_IMAGE:-qmk-nexus-builder}" \
    BUILDS_ROOT="${BUILDS_ROOT:-/tmp/tebay-builds}" \
    DEV_SERVER_PORT="${DEV_SERVER_PORT:-8080}" \
    BIND_HOST="${BIND_HOST:-127.0.0.1}" \
    python3 "$ROOT/docker/builder/server.py"
    ;;
  clean)
    echo "Removing containers, images, and volumes..."
    $COMPOSE down --rmi local --volumes --remove-orphans
    ;;
  help|--help|-h)
    usage
    ;;
  *)
    echo "Unknown command: $1"
    usage
    exit 1
    ;;
esac
