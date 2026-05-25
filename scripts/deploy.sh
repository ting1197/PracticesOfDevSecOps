#!/bin/bash
set -euo pipefail

ENV="${1:-dev}"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

echo "========================================"
echo "Deploying to environment: $ENV"
echo "========================================"

# Step 1: Create namespace
echo "---> Creating namespace..."
kubectl apply -f "${PROJECT_DIR}/k8s/base/namespace.yaml"

# Step 2: Generate TLS certificates
echo "---> Generating TLS certificates..."
bash "${PROJECT_DIR}/tls/generate-certs.sh" shop.local ecommerce

# Step 3: Apply RBAC
echo "---> Applying RBAC..."
kubectl apply -f "${PROJECT_DIR}/k8s/rbac/" -n ecommerce

# Step 4: Apply Network Policies
echo "---> Applying Network Policies..."
kubectl apply -f "${PROJECT_DIR}/k8s/network-policies/" -n ecommerce

# Step 5: Apply Kustomize overlay
echo "---> Applying Kustomize overlay ($ENV)..."
kubectl apply -k "${PROJECT_DIR}/k8s/overlays/${ENV}"

# Step 6: Apply Ingress
echo "---> Applying Ingress..."
kubectl apply -f "${PROJECT_DIR}/k8s/ingress/ingress.yaml" -n ecommerce

# Step 7: Deploy monitoring
echo "---> Deploying Prometheus..."
kubectl apply -f "${PROJECT_DIR}/k8s/monitoring/prometheus/" -n ecommerce

echo "---> Deploying Grafana..."
kubectl apply -f "${PROJECT_DIR}/k8s/monitoring/grafana/" -n ecommerce

# Step 8: Wait for rollout
echo ""
echo "---> Waiting for deployments to be ready..."
kubectl rollout status deployment/frontend -n ecommerce --timeout=120s || true
kubectl rollout status deployment/order-service -n ecommerce --timeout=120s || true
kubectl rollout status deployment/inventory-service -n ecommerce --timeout=120s || true
kubectl rollout status deployment/postgres -n ecommerce --timeout=120s || true

echo ""
echo "========================================"
echo "Deployment complete!"
echo "========================================"
echo ""
kubectl get all -n ecommerce
