# EC2 Setup Guide

One-time setup for the production EC2 instance.

## 1. Launch EC2

- **AMI**: Ubuntu 24.04 LTS
- **Instance type**: t3.small (minimum) or t3.medium (recommended)
- **Storage**: 20 GB gp3
- **Security group inbound rules**:
  | Port | Source    | Purpose           |
  |------|-----------|-------------------|
  | 22   | Your IP   | SSH               |
  | 80   | 0.0.0.0/0 | HTTP / ACME       |
  | 443  | 0.0.0.0/0 | HTTPS             |
- Assign an **Elastic IP** and point your DNS A records to it.

## 2. DNS records (Namecheap or Route 53)

```
A  api.anyserver.site      → <EC2 Elastic IP>
A  admin.anyserver.site    → <EC2 Elastic IP>
A  register.anyserver.site → <EC2 Elastic IP>
```

## 3. Install Docker + Docker Compose

```bash
# Connect to EC2
ssh -i your-key.pem ubuntu@<EC2_IP>

# Install Docker
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker ubuntu
newgrp docker

# Verify
docker --version
docker compose version
```

## 4. Clone the repository

```bash
sudo mkdir -p /opt/oae
sudo chown ubuntu:ubuntu /opt/oae
git clone https://github.com/<your-org>/<your-repo>.git /opt/oae
cd /opt/oae
```

## 5. Create environment files

**`/opt/oae/.env`** — Docker Compose variables:
```env
DOCKERHUB_USERNAME=yourdockerhubusername
TAG=latest
```

**`/opt/oae/.env.server`** — Server runtime secrets:
```env
DATABASE_URL=postgres://user:password@host:5432/dbname?sslmode=require
REDIS_ADDR=redis:6379
JWT_SECRET=your-jwt-secret
APP_PORT=3000
APP_ENV=production
AWS_ACCESS_KEY_ID=...
AWS_SECRET_ACCESS_KEY=...
AWS_REGION=ap-south-1
S3_BUCKET_NAME=...
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=...
SMTP_PASSWORD=...
```

Keep these files out of git — they are listed in `.gitignore`.

## 6. Make scripts executable

```bash
chmod +x /opt/oae/scripts/*.sh
```

## 7. Obtain SSL certificates (first time only)

DNS must be pointing to EC2 before running this.

```bash
export SSL_EMAIL=your@email.com
bash /opt/oae/scripts/init-ssl.sh
```

## 8. Start everything

```bash
cd /opt/oae
docker compose up -d
docker compose ps
```

## 9. Add GitHub Actions secrets

In your GitHub repo → Settings → Secrets and variables → Actions:

| Secret              | Value                                    |
|---------------------|------------------------------------------|
| `DOCKERHUB_USERNAME`| Your Docker Hub username                 |
| `DOCKERHUB_TOKEN`   | Docker Hub access token (not password)   |
| `EC2_HOST`          | EC2 Elastic IP or hostname               |
| `EC2_USER`          | `ubuntu`                                 |
| `EC2_SSH_KEY`       | Contents of your EC2 private key `.pem`  |
| `VITE_API_URL`      | `https://api.anyserver.site`             |

## 10. Verify deployments

After pushing to `main`, each workflow:
1. Runs tests
2. Builds and pushes image to Docker Hub
3. SSHs into EC2 and runs `scripts/deploy.sh <service>`

```bash
# Check running containers on EC2
docker compose -f /opt/oae/docker-compose.yml ps

# Tail logs
docker compose -f /opt/oae/docker-compose.yml logs -f server
```
