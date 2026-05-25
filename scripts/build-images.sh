#!/bin/bash
set -euo pipefail

REGISTRY="${1:-ecommerce}"
TAG="${2:-latest}"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

echo "========================================"
echo "Building Docker images..."
echo "Registry: $REGISTRY"
echo "Tag: $TAG"
echo "========================================"

SERVICES=("frontend" "order-service" "inventory-service")

for svc in "${SERVICES[@]}"; do
  echo ""
  echo "---> Building $svc..."
  docker build -t "${REGISTRY}/${svc}:${TAG}" "${PROJECT_DIR}/${svc}"
  echo "---> $svc built successfully ✓"
done

echo ""
echo "========================================"
echo "All images built successfully!"
echo "========================================"
docker images | grep "$REGISTRY"
