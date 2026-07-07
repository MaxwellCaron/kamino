# Kamino on Argo CD and k3s

This deployment uses an Istio ingress gateway and public GHCR images. The API
connects directly to PostgreSQL, Proxmox, and AD; no Istio egress resources,
sidecar injection, or image pull secrets are required.

Both the production (`kamino`) and development (`kamino-dev`) environments share
the same Kustomize base and Dockerfile targets. They differ only in namespace,
hostname, image repositories, and the independently configured cluster secrets.

## Common prerequisites

- Istio is installed and the default ingress gateway (pods labeled
  `istio: ingressgateway`, normally in `istio-system`) is running.
- The bundled k3s Traefik is disabled (`--disable traefik`) so the Istio
  ingress gateway can own the load balancer's ports 80 and 443.
- Argo CD Image Updater is installed if automatic image digest updates are
  wanted.
- DNS for the production hostname points to the `istio-ingressgateway`
  load balancer.
- PostgreSQL is reachable from the cluster and the Kamino schema has been
  initialized.
- Proxmox is reachable on TCP 8006 and AD is reachable on TCP 636.

The API requires only normal pod egress. If the namespace later receives a
default-deny NetworkPolicy, explicitly allow cluster DNS, PostgreSQL, Proxmox,
and AD.

## Production deployment

### Configure the production origin

The shared manifests contain only `placeholder.invalid`. Create a local Argo
CD Application file and replace that placeholder with this cluster's hostname:

```bash
cp deploy/argocd/kamino-application.example.yaml \
  deploy/argocd/kamino-application.yaml

# Edit deploy/argocd/kamino-application.yaml and replace placeholder.invalid.
```

`kamino-application.yaml` is ignored by Git. It can contain a different hostname
for every installation without modifying the shared repository. Its Kustomize
patch sets `PUBLIC_HOST`, and the production overlay propagates that single
value to the Gateway server hosts, the VirtualService host, and the API's
HTTPS `FRONTEND_URL`.

`FRONTEND_URL` must be the exact HTTPS origin because it controls CORS, secure
authentication cookies, and VNC WebSocket origin validation.

### Initialize PostgreSQL

The repository currently contains an initial schema, not a repeatable migration
system. Create a database named `kamino`, then apply the schema exactly once
before starting the API:

```bash
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 \
  -f apps/api/database/schema/schema.sql
```

Do not run the full schema as an Argo CD sync hook; statements such as enum and
table creation are intentionally not repeatable.

### Create cluster-only secrets

The Secret is deliberately not present in Kustomize and is not managed by Argo
CD. Kubernetes Secrets are namespace-scoped, so create it in `kamino`:

```bash
kubectl create namespace kamino \
  --dry-run=client -o yaml | kubectl apply -f -

cp deploy/k8s/kamino-secrets.env.example deploy/k8s/kamino-secrets.env
chmod 600 deploy/k8s/kamino-secrets.env

# Edit deploy/k8s/kamino-secrets.env and replace every example value.

kubectl -n kamino create secret generic kamino-secrets \
  --from-env-file=deploy/k8s/kamino-secrets.env \
  --dry-run=client -o yaml | kubectl apply -f -
```

`deploy/k8s/kamino-secrets.env` is ignored by Git. Keep it local to the
installation and do not force-add it.

Production authentication requires the LDAP settings. If `LDAP_URL` is not
configured, the API does not install authentication middleware.

The Gateway references the certificate through Istio SDS (`credentialName`),
which requires the Secret to live in the same namespace as the ingress
gateway pods — `istio-system` by default, not `kamino`:

```bash
cp /secure/path/tls.crt deploy/k8s/kamino-tls.crt
cp /secure/path/tls.key deploy/k8s/kamino-tls.key
chmod 600 deploy/k8s/kamino-tls.key

kubectl -n istio-system create secret tls kamino-tls \
  --cert=deploy/k8s/kamino-tls.crt \
  --key=deploy/k8s/kamino-tls.key \
  --dry-run=client -o yaml | kubectl apply -f -
```

Both local TLS files are ignored by Git. The certificate is public material,
but keeping the pair together reduces the chance of committing the private key.

For internal certificate authorities, ensure the API image trusts the CA. Keep
`PROXMOX_INSECURE` and `LDAP_INSECURE` set to `false` in production.

### Deploy

After the manifests are committed to `main`, create the Argo CD Application
from the ignored per-cluster file:

```bash
kubectl apply -f deploy/argocd/kamino-application.yaml
```

The application creates resources in the `kamino` namespace. The API uses one
replica with a `Recreate` rollout because startup reconciliation and VNC session
handoffs are process-local. The web tier uses two replicas with normal rolling
updates.

Argo CD Image Updater follows the digest behind each public `latest` tag. The
workloads use `Always`, so every newly created or restarted pod checks GHCR for
the current image. Pull policy alone does not restart running pods; Image
Updater's digest change updates the pod template and causes the rollout.

## Development deployment

The development environment (`kamino-dev`) deploys the `development` branch into
its own namespace with independently configured secrets. It must never share the
production database, Proxmox cluster/token, or writable AD scope.

Routine direct commits to `development` are supported. The CD workflow calls the
reusable API and web validation jobs first; images are published and Argo rolls
only when both pass. Larger changes may use pull requests targeting `development`
instead.

### 1. Confirm branch mirroring

Confirm the `development` branch is present and up to date in the GitHub
repository referenced by the Argo CD Application (`repoURL`) and by GitHub
Actions. Both CD and Argo CD observe the GitHub remote, not a local or Gitea
mirror. Push or sync the branch before proceeding.

### 2. Choose a development hostname

Pick a hostname distinct from production and point DNS at the Istio ingress
gateway's load balancer IP. The development hostname controls CORS, secure
cookies, and VNC WebSocket origin validation; it must not overlap with the
production hostname.

### 3. Configure the dev Application

```bash
cp deploy/argocd/kamino-dev-application.example.yaml \
  deploy/argocd/kamino-dev-application.yaml

# Edit deploy/argocd/kamino-dev-application.yaml and replace dev.placeholder.invalid
# with the actual development hostname.
```

`kamino-dev-application.yaml` is ignored by Git.

### 4. Initialize the development database

Create a **separate** database for development — do not reuse the production
database. Apply the schema once before starting the API:

```bash
psql "$DEV_DATABASE_URL" -v ON_ERROR_STOP=1 \
  -f apps/api/database/schema/schema.sql
```

### 5. Create development cluster secrets

> **Isolation warning**: The development API performs the same startup
> reconciliation as production, including Proxmox mirror reconciliation that is
> not disabled by `PROXMOX_INITIAL_SYNC_ENABLED`. Development **must** use:
>
> - A **separate Postgres database** with the schema initialized independently.
> - A **non-production Proxmox cluster or scope** and a dedicated token — simply
>   disabling `PROXMOX_INITIAL_SYNC_ENABLED` does not prevent mirror
>   reconciliation side effects.
> - A **distinct `JWT_SECRET`** so development sessions cannot be replayed
>   against production.
> - **Test AD OUs and service credentials** when LDAP is enabled. When `LDAP_URL`
>   is omitted the API installs no authentication middleware, so an
>   unauthenticated development deployment must not be publicly reachable.

```bash
kubectl create namespace kamino-dev \
  --dry-run=client -o yaml | kubectl apply -f -

cp deploy/k8s/kamino-secrets.env.example deploy/k8s/kamino-dev-secrets.env
chmod 600 deploy/k8s/kamino-dev-secrets.env

# Edit deploy/k8s/kamino-dev-secrets.env — fill in all development values.
# Use isolated database, Proxmox, JWT, and LDAP credentials (not production values).

kubectl -n kamino-dev create secret generic kamino-secrets \
  --from-env-file=deploy/k8s/kamino-dev-secrets.env \
  --dry-run=client -o yaml | kubectl apply -f -
```

`kamino-dev-secrets.env` is ignored by Git.

### 6. Create the development TLS secret

The TLS secret must live in the same namespace as the Istio ingress gateway pods
(normally `istio-system`):

```bash
cp /secure/path/dev-tls.crt deploy/k8s/kamino-dev-tls.crt
cp /secure/path/dev-tls.key deploy/k8s/kamino-dev-tls.key
chmod 600 deploy/k8s/kamino-dev-tls.key

kubectl -n istio-system create secret tls kamino-dev-tls \
  --cert=deploy/k8s/kamino-dev-tls.crt \
  --key=deploy/k8s/kamino-dev-tls.key \
  --dry-run=client -o yaml | kubectl apply -f -
```

Both local dev TLS files are ignored by Git.

### 7. Apply the dev Application and verify

```bash
kubectl apply -f deploy/argocd/kamino-dev-application.yaml
```

In Argo CD, confirm the `kamino-dev` Application is Synced and Healthy, targets
revision `development`, and deploys into the `kamino-dev` namespace. Verify the
running pods reference the `kamino-dev-api` and `kamino-dev-web` image
repositories.

### Development workflow

Routine commits go directly to `development`. The CD workflow:

1. Calls the reusable API and web validation jobs (same checks as CI on PRs).
2. Publishes `ghcr.io/maxwellcaron/kamino-dev-api:{latest,sha-*}` and
   `ghcr.io/maxwellcaron/kamino-dev-web:{latest,sha-*}` only when both pass.
3. Argo CD Image Updater detects the new digest behind `latest` and triggers a
   rollout in `kamino-dev`.

A failed validation job prevents both image matrix jobs from starting; existing
GHCR `latest` digests are not changed.

For larger changes, open a pull request targeting `development`. The same CI
jobs run on the PR; after merge the CD pipeline runs again for the merged commit.
