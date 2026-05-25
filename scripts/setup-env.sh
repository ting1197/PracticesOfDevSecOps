#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
ENV_FILE="${PROJECT_DIR}/.env"

if [ -f "$ENV_FILE" ]; then
  echo ".env file already exists. Skipping creation."
  echo "To recreate, delete .env first."
  exit 0
fi

echo "Creating .env file with default development values..."

cat > "$ENV_FILE" <<EOF
# Database Configuration
DB_HOST=localhost
DB_PORT=5432
DB_NAME=ecommerce
DB_USER=ecommerce
DB_PASSWORD=$(openssl rand -base64 24)

# PostgreSQL (used by postgres container)
POSTGRES_USER=ecommerce
POSTGRES_PASSWORD=$(openssl rand -base64 24)
POSTGRES_DB=ecommerce

# Service Ports
FRONTEND_PORT=3000
ORDER_SERVICE_PORT=3001
INVENTORY_SERVICE_PORT=3002

# Service URLs (for local development)
ORDER_SERVICE_URL=http://localhost:3001
INVENTORY_SERVICE_URL=http://localhost:3002

# Node Environment
NODE_ENV=development
LOG_LEVEL=debug

# Grafana
GF_ADMIN_USER=admin
GF_ADMIN_PASSWORD=$(openssl rand -base64 16)
EOF

echo ".env file created at: $ENV_FILE"
echo "IMPORTANT: Review and update passwords before deploying to production!"
echo "WARNING: Never commit .env to version control!"
