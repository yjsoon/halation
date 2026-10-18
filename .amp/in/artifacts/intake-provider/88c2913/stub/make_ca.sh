#!/usr/bin/env bash
# Create a throwaway CA and a 127.0.0.1 server certificate for the stub
# provider. Everything stays inside the stub directory; the CA is trusted
# only inside the test simulator via `xcrun simctl keychain add-root-cert`.
set -euo pipefail
cd "$(dirname "$0")"

openssl req -x509 -newkey rsa:2048 -nodes -days 2 \
  -subj "/CN=HowMuch Stub E2E CA" \
  -keyout ca.key -out ca.pem 2>/dev/null

cat > server.cnf <<'EOF'
[req]
distinguished_name = dn
req_extensions = ext
[dn]
[ext]
subjectAltName = IP:127.0.0.1,DNS:localhost
EOF

openssl req -newkey rsa:2048 -nodes \
  -subj "/CN=127.0.0.1" -config server.cnf \
  -keyout server.key -out server.csr 2>/dev/null

openssl x509 -req -in server.csr -CA ca.pem -CAkey ca.key -CAcreateserial \
  -days 2 -extensions ext -extfile server.cnf -out server.pem 2>/dev/null

echo "wrote ca.pem server.pem server.key"
