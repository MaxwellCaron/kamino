# Kamino on Argo CD and k3s

This deployment uses an Istio ingress gateway and public GHCR images. The API
connects directly to PostgreSQL, Proxmox, and AD; no Istio egress resources,
sidecar injection, or image pull secrets are required.

## Prerequisites

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

## Configure the production origin

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

## Initialize PostgreSQL

The repository currently contains an initial schema, not a repeatable migration
system. Create a database named `kamino`, then apply the schema exactly once
before starting the API:

```bash
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 \
  -f apps/api/database/schema/schema.sql
```

Do not run the full schema as an Argo CD sync hook; statements such as enum and
table creation are intentionally not repeatable.

## Create cluster-only secrets

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

## Deploy

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
