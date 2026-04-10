# ODI web client

React + TypeScript + Vite SPA for the admin UI (dashboard, settings, user management, and related flows).

## Requirements

- Node.js 20+ (recommended)
- npm

## Local development

```bash
npm ci
npm run dev
```

Create a `.env` in this folder so the dev server can reach the API:

| Variable | Purpose |
|----------|---------|
| `VITE_API_URL` | Backend base URL (e.g. `https://api.example.com` or `http://localhost:3000`) |
| `VITE_DEV_USE_PROXY` | Set to `1` to call `/api` on the Vite dev server and proxy to `VITE_API_URL` |

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Dev server with HMR |
| `npm run build` | Typecheck + production bundle to `dist/` |
| `npm run preview` | Serve the production build locally |
| `npm run lint` | ESLint |
| `npm run test` | Vitest unit tests (`src/**/*.test.ts`) |
| `npm run test:watch` | Vitest watch mode |
| `npm run test:coverage` | Vitest + V8 coverage → `coverage/lcov.info` (Codecov) |
| `npm run test:e2e` | Playwright E2E (`test/e2e/`) — starts Vite automatically |
| `npm run test:e2e:ui` | Playwright UI mode |
| `npm run test:e2e:install` | Install Chromium for Playwright (run once per machine/CI) |

## End-to-end tests

Specs live under [`test/e2e/`](test/e2e/). First-time setup:

```bash
npm run test:e2e:install
npm run test:e2e
```

`playwright.config.ts` boots the dev server on `127.0.0.1:5173` unless one is already running.

## Coverage (Codecov)

Unit coverage is produced by Vitest (`npm run test:coverage`). CI uploads `coverage/lcov.info` with [Codecov’s GitHub Action](https://github.com/codecov/codecov-action).

1. Enable the repository on [codecov.io](https://about.codecov.io/) and copy the upload token.
2. In GitHub: **Settings → Secrets and variables → Actions**, add `CODECOV_TOKEN`.
3. Optional tuning: [`codecov.yml`](codecov.yml) at the project root.

If the secret is missing, the upload step is skipped without failing the workflow (`fail_ci_if_error: false`).

## CI (GitHub Actions)

Workflow: [`.github/workflows/ci.yml`](.github/workflows/ci.yml). GitHub only runs workflows from the **repository** `.github` directory, so this applies when this project is checked out as the git root (not when `client/` is nested inside another repo).

## Docker (static nginx)

Build-time env is required for API URLs (`VITE_*` is inlined by Vite).

```bash
docker compose up --build
```

Override API URL and port:

```bash
VITE_API_URL=https://your-api.example.com CLIENT_PORT=8080 docker compose up --build
```

Or build the image directly:

```bash
docker build -t odi-client --build-arg VITE_API_URL=https://your-api.example.com .
```

The container serves on port **80** inside; compose maps **8080 → 80** by default.
