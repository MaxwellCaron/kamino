# Kamino

Kamino is a small internal VM-management application for ~100 users that wraps Proxmox with an inventory model, Discord-like ACLs/roles, request workflows, pod publishing/cloning, VNC console access, and Active Directory–backed principals. Postgres is the source of truth; Proxmox is mirrored and reconciled against it on startup and during operation.

## Stack

| Layer | Technology |
|-------|-----------|
| API | Go 1.26 · Gin · pgx/v5 · sqlc |
| Frontend | TanStack Start · Vite · TanStack Query/Router |
| UI primitives | Shared shadcn-style package (`@workspace/ui`) |
| Tooling | Bun 1.3.11 · Turbo monorepo |

## Repository layout

```
apps/api/          Go API server
  cmd/api/         Entry point and dependency wiring
  internal/        Handlers, services, auth, authorization, proxmox, principals, requests, vmactions
  database/        sqlc-generated query layer (*.sql.go — do not hand-edit)
  database/schema/ schema.sql — Postgres schema source of truth
  database/queries/ *.sql — sqlc query sources

apps/web/          TanStack Start SPA
  src/routes/      File-based TanStack Router pages (routeTree.gen.ts — do not hand-edit)
  src/features/    Feature modules (API clients, components, hooks, types per feature)
  src/components/  App-wide shared components

packages/ui/       Shared UI primitives exported as @workspace/ui
```

## Prerequisites

- **Bun** 1.3.11 (`curl -fsSL https://bun.sh/install | bash`)
- **Go** 1.26
- **Postgres** instance reachable from the API
- **Proxmox** cluster with an API token (`kamino@pve!<token-name>`)
- **AD/LDAP** — optional; required only if AD auth/sync is enabled

## Quick start (local dev)

```bash
bun install
cp apps/api/.env.example apps/api/.env
# Edit apps/api/.env — fill in all [required] values
bun run dev
```

The web dev server runs on **:3000** and proxies `/api` to the API at **:8080**. The API loads `apps/api/.env` automatically via godotenv.

## Docker

```bash
bun run docker:up    # builds and starts api + web containers
bun run docker:down  # stops and removes containers
```

The compose file has no Postgres service — `DATABASE_URL` must point at an existing instance. Container configuration is read from `apps/api/.env.docker` (optional; same keys as `.env.example`).

The API healthcheck endpoint is `GET /api/v1/health`.

## Commands

### Root (run from repo root)

| Command | Purpose |
|---------|---------|
| `bun install` | Install all workspace dependencies |
| `bun run dev` | Start API + web in watch mode |
| `bun run build` | Production build (all workspaces) |
| `bun run test` | Run all tests |
| `bun run lint` | Lint all workspaces |
| `bun run typecheck` | TypeScript type-check all workspaces |
| `bun run format` | Format all workspaces |
| `bun run docker:up` | Build and start Docker containers |
| `bun run docker:down` | Stop and remove Docker containers |

### API (run from `apps/api/`)

| Command | Purpose |
|---------|---------|
| `go build ./cmd/api` | Compile the API binary |
| `go test ./...` | Run Go tests |
| `sqlc generate` | Regenerate database query code from SQL sources |

## Configuration

All configuration is loaded from environment variables (or `apps/api/.env`). Copy `apps/api/.env.example` to get started.

| Variable | Required | Default | Purpose |
|----------|----------|---------|---------|
| `DATABASE_URL` | yes | — | Postgres connection string |
| `JWT_SECRET` | yes | — | Signing key for JWT tokens |
| `PROXMOX_URL` | yes | — | Proxmox API base URL |
| `PROXMOX_TOKEN_ID` | yes | — | Proxmox API token ID |
| `PROXMOX_TOKEN_SECRET` | yes | — | Proxmox API token secret |
| `PROXMOX_NODES` | yes | — | Comma-separated Proxmox node names |
| `PROXMOX_INSECURE` | no | `false` | Skip TLS verification (lab only) |
| `PORT` | no | `:8080` | API listen address |
| `FRONTEND_URL` | no | `http://localhost:3000` | Allowed CORS origin |
| `LDAP_URL` | no | — | LDAP server URL (enables AD auth/sync) |
| `LDAP_BIND_DN` | no | — | Service account DN |
| `LDAP_BIND_PASSWORD` | no | — | Service account password |
| `LDAP_SEARCH_BASE_DN` | no | — | LDAP search base |
| `LDAP_USER_OU` | no | — | OU containing user accounts |
| `LDAP_GROUP_OU` | no | — | OU containing groups |
| `LDAP_ADMIN_GROUP_DN` | no | — | DN of the Kamino admins group |
| `LDAP_INSECURE` | no | `false` | Skip TLS verification (lab only) |
| `POD_ROUTER_TEMPLATE_ITEM_ID` | no | — | Proxmox item ID of router template for pod cloning |

## Security notes

- Keep real credentials only in untracked `.env*` files (`.env`, `.env.docker`). Never commit them.
- Generate `JWT_SECRET` with `openssl rand -base64 32`.
- Leave `PROXMOX_INSECURE` and `LDAP_INSECURE` as `false` outside isolated lab environments.
