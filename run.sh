#!/usr/bin/env bash
set -euo pipefail

COMPOSE="podman compose -f docker/docker-compose.yml"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

usage() {
  cat <<EOF
Usage: $(basename "$0") <command>

Commands:
  dev         Start frontend + backend in dev mode (hot reload)
  build       Build all Docker images
  up          Start full stack in background
  down        Stop all containers
  logs        Tail logs from all containers
  builder     Build the firmware builder image only
  backend     Start backend only
  frontend    Start frontend only
  clean       Remove all containers, images, volumes for this project
  help        Show this message
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
    echo "Starting stack in background..."
    $COMPOSE up -d --build frontend backend
    echo "Frontend: http://localhost:3000"
    echo "Backend:  http://localhost:8000"
    echo "API docs: http://localhost:8000/docs"
    ;;
  down)
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
