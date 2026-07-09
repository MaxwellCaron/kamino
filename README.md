# Kamino

Kamino is a small internal VM-management application for ~100 users that wraps Proxmox with an inventory model, Discord-like ACLs/roles, request workflows, pod publishing/cloning, VNC console access, and a configurable principal provider (Active Directory or Proxmox). Postgres is the source of truth; Proxmox is mirrored and reconciled against it on startup and during operation.

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
- **Air** (Go live-reload; `go install github.com/air-verse/air@latest`) — required for `bun run dev` API watch mode
- **Postgres** instance reachable from the API
- **Proxmox** cluster with an API token (`kamino@pve!<token-name>`)
- **Principal provider** — required; `active_directory` or `proxmox`

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

The compose file has no Postgres service — `DATABASE_URL` must point at an existing instance. Container configuration is read from `.env.docker` at the repo root (optional; same keys as `.env.example`).

The API healthcheck endpoint is `GET /api/v1/health`.

## Development workflow

The intended fast loop is `bun run dev` on a **dedicated internal dev
VM/workstation** — not a Kubernetes control-plane or worker node. Use the
existing Bun 1.3.11, Go 1.26, and Air prerequisites above.

```
dedicated dev VM/workstation (bun run dev, hot reload)
  -> commit/push development
  -> reusable API/web CI
  -> dev GHCR images (kamino-dev-api, kamino-dev-web)
  -> Argo CD kamino-dev integration environment
  -> merge development to main
  -> production images and Argo rollout
```

- Checkout `development`. The web dev server runs on **:3000** and proxies
  `/api` to the API at **:8080** as documented under Quick start.
- `apps/api/.env` must point to **isolated** development dependencies: a
  separate Postgres database, a non-production Proxmox scope, a distinct
  `JWT_SECRET`, and test LDAP OUs/credentials when AD is enabled. Never copy
  the production environment file.
- Raw Bun/Vite/Air ports must remain internal (VPN/LAN/firewall). If a stable
  HTTPS origin is needed for secure cookies, CORS, or VNC WebSockets, put an
  operator-managed internal TLS reverse proxy in front of the dev processes.
- `bun run dev` is for rapid single-developer iteration. The Argo CD
  `kamino-dev` environment is where built container images, nginx, Istio
  routing, TLS, namespace configuration, and rollout behavior are validated
  before production.
- Routine work may be committed directly to `development`. The CD workflow
  calls the reusable API and web validation first and publishes dev images only
  when both pass. Larger changes may use pull requests into `development`.
- Do not run the hot-reload API and the Kubernetes dev API concurrently against
  the same Proxmox scope; the startup mirror reconciliation runs in both.

## Kubernetes / Argo CD

Kustomize manifests for k3s with Istio, plus Argo CD Application definitions
for both production (`kamino`) and development (`kamino-dev`), live under
`deploy/`. See [`deploy/k8s/README.md`](deploy/k8s/README.md) for database,
cluster-only Secret, TLS, and deployment prerequisites for each environment.

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
| `PROXMOX_INITIAL_SYNC_ENABLED` | no | `true` | Run the startup Proxmox-to-database inventory import |
| `PRINCIPAL_PROVIDER` | yes | — | `active_directory` or `proxmox` |
| `PRINCIPAL_INITIAL_SYNC_ENABLED` | no | `true` | Run the startup principal sync for the selected provider |
| `PRINCIPAL_BOOTSTRAP_ADMIN_GROUP` | no | — | Initial admin group seed: AD DN in AD mode, Proxmox group ID in Proxmox mode |
| `PROXMOX_AUTH_REALM` | no | `pve` | Default Proxmox realm for login and managed users when `PRINCIPAL_PROVIDER=proxmox` |
| `PROXMOX_MANAGED_USER_REALM` | no | `PROXMOX_AUTH_REALM` | Realm appended to bare usernames created through Kamino in Proxmox mode |
| `PORT` | no | `:8080` | API listen address |
| `FRONTEND_URL` | no | `http://localhost:3000` | Allowed CORS origin |
| `LDAP_URL` | when AD | — | LDAP server URL (required when `PRINCIPAL_PROVIDER=active_directory`) |
| `LDAP_BIND_DN` | when AD | — | Service account DN |
| `LDAP_BIND_PASSWORD` | when AD | — | Service account password |
| `LDAP_SEARCH_BASE_DN` | when AD | — | LDAP search base |
| `LDAP_USER_OU` | no | — | OU containing user accounts |
| `LDAP_GROUP_OU` | no | — | OU containing groups |
| `LDAP_INSECURE` | no | `false` | Skip TLS verification (lab only) |
| `POD_ROUTER_TEMPLATE_ITEM_ID` | no | — | Proxmox item ID of router template for pod cloning |
| `POD_CLONE_VNET_PREFIX` | no | `pod` | Prefix for pre-created clone VNets |
| `POD_CLONE_NETWORK_MIN` | no | `1` | First published-clone network number |
| `POD_CLONE_NETWORK_MAX` | no | `244` | Last published-clone network number |
| `POD_DEV_NETWORK_MIN` | no | `245` | First create-pod developer network number |
| `POD_DEV_NETWORK_MAX` | no | `254` | Last create-pod developer network number |
| `POD_ROUTER_WAIT_TIMEOUT` | no | `5m` | Timeout for clone-time router readiness checks |
| `POD_ROUTER_WAN_IP_BASE` | no | `172.16.` | External NAT subnet prefix used in clone metadata |
| `POD_ROUTER_INTERNAL_SUBNET` | no | `192.168.1.0/24` | Fixed internal LAN every pod router uses; must match the `INTERNAL_SUBNET` used to generate router snippets (see below) |
| `POD_ROUTER_CLOUD_INIT_STORAGE` | no | `local` | Proxmox storage name that exposes the pre-created router cloud-init snippets |
| `POD_ROUTER_CLOUD_INIT_USER_FILE_PATTERN` | no | `kamino-router-{network}-user-data.yaml` | User-data snippet filename pattern for the allocated network number |
| `POD_ROUTER_CLOUD_INIT_NETWORK_FILE` | no | `kamino-router-network-config.yaml` | Shared Proxmox network-config snippet filename attached to every cloned router |
| `POD_PUBLISH_VMID_MIN` | no | `1000` | First VMID available for publish/template-preparation clones (inclusive) |
| `POD_PUBLISH_VMID_MAX` | no | `1999` | Last VMID available for publish/template-preparation clones (inclusive) |
| `POD_CLONE_VMID_MIN` | no | `2000` | First VMID available for catalog clone/reclone operations (inclusive) |
| `POD_CLONE_VMID_MAX` | no | `9999` | Last VMID available for catalog clone/reclone operations (inclusive) |
| `POD_DEV_VMID_MIN` | no | `10000` | First VMID available for development pod creation (inclusive) |
| `POD_DEV_VMID_MAX` | no | `19999` | Last VMID available for development pod creation (inclusive) |
| `PERSONAL_POD_VMID_MIN` | no | `20000` | First VMID available for personal pod router clones (inclusive) |
| `PERSONAL_POD_VMID_MAX` | no | `20999` | Last VMID available for personal pod router clones (inclusive) |

### VMID allocation ranges

Each pod workflow draws VMIDs from its own configured inclusive range. All four
ranges must be pairwise non-overlapping and within the Proxmox VMID bounds
(100–999999999). Kamino validates this at startup.

- Bounds are **inclusive**.
- Ranges must **not overlap** each other.
- Existing VMs inside a configured range are **skipped**, not rejected.
- Free IDs within one bulk operation **need not be contiguous**.
- Ordinary VM create/clone (not pod workflows) continues using Proxmox
  `nextid` and is not constrained to these ranges.
- An **in-process mutex** serialises VMID selection; this design assumes one
  Kamino API replica. Before increasing replicas, replace the mutex with a
  cross-process coordination mechanism.
- **Direct Proxmox activity is safe**: if a VM is created directly in Proxmox
  after Kamino's snapshot is taken, the resulting create-conflict is detected
  and Kamino retries with the next candidate automatically.
- Inventory current VMIDs before adopting custom ranges to avoid accidental
  overlap with existing machines.

By default, published pod clones reserve network numbers `1-244` and create-pod
developer environments reserve `245-254`. These ranges must not overlap.
Generated VNet IDs must also fit Proxmox's 8-character VNet limit; with the
default prefix and ranges, the longest generated ID is `pod254`.

Development and published pod routers clone directly from
`POD_ROUTER_TEMPLATE_ITEM_ID`; publishing snapshots only non-router VMs.

### Pod router networking

Every pod VNet is isolated at Layer 2, so every pod router can safely reuse
the same internal LAN (`POD_ROUTER_INTERNAL_SUBNET`, default `192.168.1.0/24`)
— only the external (WAN) `/24` differs per allocated network number. The
router NATs between the two, preserving the workload's host octet:

| | Development (network `245`) | Published clone (network `24`) |
|---|---|---|
| WAN subnet | `172.16.245.0/24` | `172.16.24.0/24` |
| LAN subnet (both) | `192.168.1.0/24` | `192.168.1.0/24` |
| Workload at `192.168.1.50` | reachable at `172.16.245.50` | reachable at `172.16.24.50` |

Configure workload guests once, as `192.168.1.<host>/24` with gateway
`192.168.1.1` — Kamino does not rewrite addressing inside guests, so existing
VMs must be readdressed to this LAN (then republished/recloned) before this
networking model takes effect for them.

## Security notes

- Keep real credentials only in untracked `.env*` files (`.env`, `.env.docker`). Never commit them.
- Generate `JWT_SECRET` with `openssl rand -base64 32`.
- Leave `PROXMOX_INSECURE` and `LDAP_INSECURE` as `false` outside isolated lab environments.

## Operations

### Source of truth

Postgres is the source of truth for all Kamino state. Proxmox is treated as an external resource that Kamino mirrors and reconciles against. When a discrepancy is found, Kamino updates Proxmox to match the database, not the other way around.

### Startup sequence

On startup the API performs these steps in order:

1. Connect to Postgres and initialize the query layer.
2. Connect to Proxmox and verify API access.
3. Run an initial inventory import from Proxmox into the database, unless `PROXMOX_INITIAL_SYNC_ENABLED` is `false`.
4. Run principal sync for the configured provider (`active_directory` or `proxmox`), unless `PRINCIPAL_INITIAL_SYNC_ENABLED` is `false`. Proxmox mode authenticates users through Proxmox `/access/ticket`, then issues Kamino JWT/session cookies. Kamino never stores user Proxmox tickets or passwords and continues using the configured Proxmox API token for inventory and VM operations.
5. Start event notifiers (inventory, VM status, requests).
6. Reconcile Proxmox mirror state against the database. This step is not controlled by `PROXMOX_INITIAL_SYNC_ENABLED`.
7. Bootstrap admin group ACLs from `PRINCIPAL_BOOTSTRAP_ADMIN_GROUP` when configured.
8. Normalize permission inheritance across the inventory tree.
9. Register HTTP routes and begin serving.

### Mirror reconcile and managed pool deletion

During step 6, Kamino compares its database state with Proxmox. Pools that Kamino previously managed but are no longer present in the database may be deleted from Proxmox during reconcile. This is expected behavior when inventory items are removed from Kamino. Review Proxmox mirror logs before running destructive sync operations in production.

### Pod router prerequisites

Pod cloning requires the following to be configured and healthy:

| Prerequisite | Env var | Check |
|---|---|---|
| Router template VM exists in inventory | `POD_ROUTER_TEMPLATE_ITEM_ID` | Must point to a valid template inventory item |
| Cloud-init snippets exist on Proxmox storage | `POD_ROUTER_CLOUD_INIT_*` | Filenames must pass validation (no path separators, no `..`) |
| VNets exist for all network numbers in range | `POD_CLONE_VNET_PREFIX` + `POD_CLONE_NETWORK_MIN/MAX` | Each `{prefix}{number}` VNet must be present in Proxmox SDN |
| WAN IP prefix is a valid dotted numeric value | `POD_ROUTER_WAN_IP_BASE` | Each segment must be 0-255 |
| Internal subnet is a valid IPv4 `/24` network | `POD_ROUTER_INTERNAL_SUBNET` | Must be a canonical `/24` network address, not a host address |
