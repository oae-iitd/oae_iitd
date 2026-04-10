# Build stage — Vite bakes VITE_* into the bundle at build time
FROM node:20-alpine AS builder

WORKDIR /app

COPY package.json package-lock.json ./

RUN npm ci

COPY . .

# Public API base URL for the browser (must match how users reach the backend)
ENV VITE_API_URL=${VITE_API_URL}

# Production builds should not rely on dev proxy
ENV VITE_DEV_USE_PROXY=${VITE_DEV_USE_PROXY}

RUN npm run build

# Production — static files + nginx
FROM nginx:1.27-alpine AS production

COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

# BusyBox wget (Alpine) — /health is defined in nginx.conf
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1/health || exit 1

CMD ["nginx", "-g", "daemon off;"]
