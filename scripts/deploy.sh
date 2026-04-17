#!/bin/bash
# EC2 deploy helper — called by GitHub Actions over SSH, or run manually.
# Usage: ./scripts/deploy.sh [server|admin|register|all]
#
# Expects these files to exist on the EC2 server:
#   /opt/oae/.env          — DOCKERHUB_USERNAME and TAG
#   /opt/oae/.env.server   — server runtime secrets (DATABASE_URL, JWT_SECRET, etc.)

set -euo pipefail

SERVICE="${1:-all}"
DEPLOY_DIR="/opt/oae"

cd "$DEPLOY_DIR"

# Pull latest compose/nginx config from git
git pull origin main --ff-only

echo "Deploying service: $SERVICE  (TAG=${TAG:-latest})"

if [ "$SERVICE" = "all" ]; then
  docker compose pull
  docker compose up -d --remove-orphans
else
  docker compose pull "$SERVICE"
  docker compose up -d --no-deps "$SERVICE"
fi

# Remove dangling images to free disk space
docker image prune -f

echo "Deploy complete."
docker compose ps
