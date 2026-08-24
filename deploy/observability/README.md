# SigNoz observability for Kamino

Self-hosted SigNoz runs in a separate `signoz` namespace and Argo CD Application so an observability outage cannot roll Kamino.

## Prerequisites

Confirm the cluster has:

- A default dynamic storage class
- At least 4 CPU cores, 8 GB RAM, and 30 GB persistent storage free (8/16/80 Gi recommended)
- An internal DNS hostname and TLS certificate for the SigNoz UI

Run the preflight from plan 001 before installing.

## Install order

1. Render and review manifests:
   ```bash
   helm repo add signoz https://charts.signoz.io && helm repo update signoz
   helm template signoz signoz/signoz --version 0.138.0 --namespace signoz \
     -f deploy/observability/signoz-values.yaml > /tmp/kamino-signoz.yaml
   helm template signoz-k8s-infra signoz/k8s-infra --version 0.17.0 --namespace signoz \
     -f deploy/observability/k8s-infra-values.yaml > /tmp/kamino-k8s-infra.yaml
   ```
2. Copy `deploy/argocd/signoz-application.example.yaml` and `signoz-k8s-infra-application.example.yaml` locally (gitignored).
3. Replace `REPLACE_WITH_K8S_CLUSTER_NAME` and the UI hostname/TLS secret references.
4. Sync SigNoz first, wait for all pods Ready, then sync k8s-infra.
5. Apply `deploy/observability/access` for Istio Gateway/VirtualService exposure of the UI only.

Kamino API pods send OTLP/HTTP to the node-local k8s-infra agent at `http://$(K8S_HOST_IP):4318`.

## Kamino telemetry variables

| Variable | Purpose |
|---|---|
| `OTEL_ENABLED` | Enable OpenTelemetry export (default false locally) |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | OTLP/HTTP endpoint (set via Downward API in Kubernetes) |
| `OTEL_TRACE_SAMPLE_RATIO` | Parent-based trace sampling ratio 0–1 |
| `DEPLOYMENT_ENVIRONMENT` | `local`, `development`, or `production` |
| `OTEL_K8S_CLUSTER_NAME` | Stable cluster name; placeholder rejected at startup |
| `K8S_NAMESPACE`, `K8S_POD_NAME`, `K8S_POD_UID` | Kubernetes resource attributes via Downward API |

Never record usernames, session IDs, JWTs, client IPs, LDAP credentials, Proxmox tokens, request bodies, or per-VM identifiers in telemetry.

## Dashboard and alerts

Import `kamino-operations-dashboard.json` into SigNoz 0.138.0. Alert definitions and runbooks live in `alerts-and-runbooks.md`.
