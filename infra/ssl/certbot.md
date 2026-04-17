# SSL / Let's Encrypt (Certbot)

SSL is handled by certbot running as a Docker container alongside nginx.

## How it works

1. **nginx** (port 80) serves Let's Encrypt ACME HTTP-01 challenges from the shared `certbot-webroot` volume.
2. **certbot** runs continuously, renewing certificates every 12 hours via `certbot renew`.
3. Renewed certs are written to the `letsencrypt` Docker volume, which nginx reads.

## First-time certificate issuance

DNS A records must already point to your EC2 before running this.

```bash
# On EC2
export SSL_EMAIL=admin@anyserver.site
bash /opt/oae/scripts/init-ssl.sh
```

This script:
1. Starts a temporary HTTP-only nginx to answer ACME challenges
2. Runs `certbot certonly --webroot` for each domain
3. Downloads certbot's recommended `options-ssl-nginx.conf`
4. Generates a 2048-bit DH params file
5. Stops the temporary nginx

After this, start the full stack:
```bash
docker compose up -d
```

## Manual renewal (if needed)

```bash
docker compose exec certbot certbot renew --force-renewal
docker compose exec nginx nginx -s reload
```

## Certificate paths inside containers

| File                                    | Purpose              |
|-----------------------------------------|----------------------|
| `/etc/letsencrypt/live/<domain>/fullchain.pem` | Certificate chain |
| `/etc/letsencrypt/live/<domain>/privkey.pem`   | Private key       |
| `/etc/letsencrypt/options-ssl-nginx.conf`       | Recommended TLS settings |
| `/etc/letsencrypt/ssl-dhparams.pem`             | DH params         |

These are mapped via the `letsencrypt` Docker named volume.

## Renewing nginx after cert renewal

Certbot only writes the new cert; nginx must be reloaded to pick it up.
The certbot container's entrypoint runs `certbot renew` (not `--force-renewal`)
and nginx auto-reloads when the cert file changes via inotify in newer nginx versions.

For safety, add a cron job on EC2 to reload nginx after renewal:

```bash
# crontab -e
0 3 * * * docker exec oae-nginx nginx -s reload
```
