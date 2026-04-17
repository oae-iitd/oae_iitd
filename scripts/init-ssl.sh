#!/bin/bash
# Run once on a fresh EC2 to get Let's Encrypt certs before starting the full stack.
# Usage: ./scripts/init-ssl.sh

set -euo pipefail

EMAIL="${SSL_EMAIL:-admin@anyserver.site}"
DOMAINS="api.anyserver.site admin.anyserver.site register.anyserver.site"

# ── 1. Pull certbot image ──────────────────────────────────────────────────
docker compose pull certbot

# ── 2. Start nginx in HTTP-only mode to answer ACME challenges ─────────────
# Temporarily use a plain HTTP config so nginx can start without certs.
cat > /tmp/nginx-init.conf << 'NGINXCONF'
events { worker_connections 1024; }
http {
    server {
        listen 80;
        server_name api.anyserver.site admin.anyserver.site register.anyserver.site;
        location /.well-known/acme-challenge/ {
            root /var/www/certbot;
        }
        location / {
            return 200 "initializing\n";
        }
    }
}
NGINXCONF

docker run -d --rm \
  --name oae-nginx-init \
  -p 80:80 \
  -v /tmp/nginx-init.conf:/etc/nginx/nginx.conf:ro \
  -v certbot-webroot:/var/www/certbot \
  nginx:1.27-alpine

# ── 3. Obtain certificates for each domain ────────────────────────────────
for DOMAIN in $DOMAINS; do
  echo "Obtaining certificate for $DOMAIN ..."
  docker run --rm \
    -v letsencrypt:/etc/letsencrypt \
    -v certbot-webroot:/var/www/certbot \
    certbot/certbot certonly \
      --webroot \
      --webroot-path=/var/www/certbot \
      --email "$EMAIL" \
      --agree-tos \
      --no-eff-email \
      -d "$DOMAIN"
done

# ── 4. Download certbot's recommended SSL options ─────────────────────────
docker run --rm \
  -v letsencrypt:/etc/letsencrypt \
  certbot/certbot \
  /bin/sh -c "
    curl -s https://raw.githubusercontent.com/certbot/certbot/master/certbot-nginx/certbot_nginx/_internal/tls_configs/options-ssl-nginx.conf \
      -o /etc/letsencrypt/options-ssl-nginx.conf;
    openssl dhparam -out /etc/letsencrypt/ssl-dhparams.pem 2048
  "

# ── 5. Stop temporary nginx ────────────────────────────────────────────────
docker stop oae-nginx-init

echo ""
echo "SSL certificates obtained. You can now start the full stack:"
echo "  docker compose up -d"
