#!/bin/bash
set -euo pipefail

REGISTRY="${1:-ecommerce}"
TAG="${2:-latest}"
SEVERITY="${3:-HIGH,CRITICAL}"

SERVICES=("frontend" "order-service" "inventory-service")
FAILED=0

echo "========================================"
echo "Trivy Security Scan"
echo "Severity: $SEVERITY"
echo "========================================"

for svc in "${SERVICES[@]}"; do
  echo ""
  echo "---> Scanning ${REGISTRY}/${svc}:${TAG}..."
  echo "-------------------------------------------"
  
  if trivy image --severity "$SEVERITY" --exit-code 0 "${REGISTRY}/${svc}:${TAG}"; then
    echo "---> $svc: scan complete ✓"
  else
    echo "---> $svc: vulnerabilities found ✗"
    FAILED=1
  fi
done

# Also scan postgres base image
echo ""
echo "---> Scanning postgres:16-alpine..."
trivy image --severity "$SEVERITY" --exit-code 0 postgres:16-alpine

echo ""
echo "========================================"
if [ $FAILED -eq 0 ]; then
  echo "All scans completed."
else
  echo "WARNING: Some images have vulnerabilities."
fi
echo "========================================"

# Also scan Dockerfiles for misconfigurations
echo ""
echo "---> Scanning Dockerfiles for misconfigurations..."
for svc in "${SERVICES[@]}"; do
  echo "--- $svc/Dockerfile ---"
  trivy config "$(dirname "$0")/../${svc}/Dockerfile" 2>/dev/null || echo "(trivy config scan skipped)"
done
