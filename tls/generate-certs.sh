#!/bin/bash
set -euo pipefail

DOMAIN="${1:-shop.local}"
NAMESPACE="${2:-ecommerce}"
OUTDIR="$(dirname "$0")/certs"

mkdir -p "$OUTDIR"

echo "==> Generating CA..."
openssl genrsa -out "$OUTDIR/ca.key" 4096
openssl req -x509 -new -nodes -sha256 -days 3650 \
  -key "$OUTDIR/ca.key" \
  -out "$OUTDIR/ca.crt" \
  -subj "/CN=ShopK8s CA/O=ShopK8s"

echo "==> Generating server certificate for ${DOMAIN}..."
openssl genrsa -out "$OUTDIR/tls.key" 2048
openssl req -new -key "$OUTDIR/tls.key" \
  -out "$OUTDIR/tls.csr" \
  -subj "/CN=${DOMAIN}/O=ShopK8s"

cat > "$OUTDIR/san.cnf" <<EOF
[req]
distinguished_name = req_distinguished_name
[req_distinguished_name]
[v3_ext]
subjectAltName = DNS:${DOMAIN},DNS:*.${DOMAIN},DNS:localhost,IP:127.0.0.1
keyUsage = digitalSignature,keyEncipherment
extendedKeyUsage = serverAuth
EOF

openssl x509 -req -in "$OUTDIR/tls.csr" \
  -CA "$OUTDIR/ca.crt" -CAkey "$OUTDIR/ca.key" -CAcreateserial \
  -days 365 -sha256 \
  -extfile "$OUTDIR/san.cnf" -extensions v3_ext \
  -out "$OUTDIR/tls.crt"

echo "==> Creating Kubernetes TLS secret..."
kubectl create secret tls shop-tls-secret \
  --cert="$OUTDIR/tls.crt" \
  --key="$OUTDIR/tls.key" \
  -n "$NAMESPACE" \
  --dry-run=client -o yaml | kubectl apply -f -

echo "==> Certificates generated in $OUTDIR"
echo "==> TLS secret 'shop-tls-secret' created in namespace '$NAMESPACE'"

# Cleanup CSR and serial
rm -f "$OUTDIR/tls.csr" "$OUTDIR/ca.srl" "$OUTDIR/san.cnf"
