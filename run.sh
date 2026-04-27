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

prepare_builds_dir() {
  local builds_root="${BUILDS_ROOT:-/tmp/tebay-builds}"
  mkdir -p "$builds_root"
  chmod 0777 "$builds_root"
}

prepare_local_db_dir() {
  local db_root="${LOCAL_DB_ROOT:-/tmp/qmk-nexus-dbs}"
  mkdir -p "$db_root"
  chmod 0777 "$db_root"
}

prepare_local_dirs() {
  prepare_builds_dir
  prepare_local_db_dir
}

start_build_proxy_background() {
  local log_file="${BUILD_PROXY_LOG:-/tmp/tebay-build-proxy.log}"
  if [[ -f /tmp/tebay-build-proxy.pid ]]; then
    local old_pid
    old_pid="$(cat /tmp/tebay-build-proxy.pid)"
    if kill -0 "$old_pid" 2>/dev/null; then
      echo "Build proxy already running: pid ${old_pid}"
      return
    fi
    rm -f /tmp/tebay-build-proxy.pid
  fi

  setsid env \
    PODMAN_BIN="${PODMAN_BIN:-$(command -v podman || echo podman)}" \
    BUILD_IMAGE="${BUILD_IMAGE:-qmk-nexus-builder}" \
    BUILDS_ROOT="${BUILDS_ROOT:-/tmp/tebay-builds}" \
    DEV_SERVER_PORT="${DEV_SERVER_PORT:-8088}" \
    BIND_HOST="${BIND_HOST:-0.0.0.0}" \
    python3 "$ROOT/docker/builder/server.py" >> "$log_file" 2>&1 < /dev/null &
  echo $! > /tmp/tebay-build-proxy.pid
  echo "Build proxy: http://localhost:${DEV_SERVER_PORT:-8088} (log: ${log_file})"
}

case "${1:-help}" in
  dev)
    check_env
    prepare_local_dirs
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
    prepare_local_dirs
    echo "Starting build proxy in background..."
    start_build_proxy_background

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
    prepare_local_dirs
    $COMPOSE up --build backend
    ;;
  frontend)
    $COMPOSE up --build frontend
    ;;
  build-proxy)
    prepare_builds_dir
    echo "Starting local build proxy on http://localhost:${DEV_SERVER_PORT:-8088} ..."
    BUILD_IMAGE="${BUILD_IMAGE:-qmk-nexus-builder}" \
    BUILDS_ROOT="${BUILDS_ROOT:-/tmp/tebay-builds}" \
    DEV_SERVER_PORT="${DEV_SERVER_PORT:-8088}" \
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
