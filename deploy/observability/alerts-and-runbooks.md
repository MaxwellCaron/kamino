# Kamino alerts and runbooks

Each alert links to the matching section of `kamino-operations-dashboard.json`.

## API 5xx rate > 5% for 5 minutes (min 20 requests)

**Meaning**: More than one in twenty API requests are failing with server errors.

**SigNoz query**: Trace-derived HTTP metrics, `service.name=kamino-api`, `http.status_code >= 500`, exclude `/api/v1/health`, `/api/v1/ready`, `/api/v1/events`, `/api/v1/vnc/ws`.

**First checks**:
1. `kubectl -n kamino-dev logs deploy/kamino-api --tail=200`
2. Open a failing trace; inspect pgx, Proxmox, and LDAP child spans.
3. `kubectl -n kamino-dev get pods,events`

**Mitigation**: Scale is fixed at one replica today; restart only after checking DB and Proxmox task state. Do not retry mutating Proxmox calls blindly.

**Escalate** when 5xx persists >15 minutes or correlates with data loss risk.

**Recovery**: 5xx rate below 5% for 10 minutes.

## API p95 > 1.2s for 5 minutes (min 20 requests)

**Meaning**: Ordinary API routes are slow; long-lived SSE/VNC routes are excluded.

**SigNoz query**: `durationNano` p95 on Gin spans excluding health, ready, events, vnc/ws.

**First checks**:
1. Dependency panels for pgx pool acquire latency and Proxmox/LDAP duration.
2. Node CPU/memory pressure in Kubernetes section.
3. Recent deploy version change via `service.version` filter.

**Mitigation**: Identify slow normalized `http.route` in trace table; avoid restarting during active pod publishes.

**Escalate** when p95 > 3s or users report widespread timeouts.

**Recovery**: p95 < 1.2s for 10 minutes.

## Proxmox error rate > 10% for 5 minutes

**Meaning**: Proxmox client spans are failing or returning HTTP >= 400.

**SigNoz query**: Spans named `Proxmox *` with error status, `peer.service=proxmox`.

**First checks**:
1. `kubectl -n kamino-dev logs deploy/kamino-api | grep -i proxmox`
2. Verify Proxmox node reachability and token validity outside Kamino.
3. Check Kamino DB inventory state before retrying mutating operations.

**Mitigation**: Pause bulk VM operations; confirm upstream task IDs in audit ledger.

**Escalate** when all nodes fail or replication/storage errors appear upstream.

**Recovery**: Proxmox error rate < 10% for 10 minutes.

## LDAP error rate > 10% for 5 minutes

**Meaning**: LDAP infrastructure spans (`LDAP connect`, `LDAP fetch users`, `LDAP fetch groups`) are failing. Invalid user credentials are excluded.

**SigNoz query**: LDAP spans with error status excluding expected authentication results.

**First checks**:
1. LDAP server reachability from API pod network.
2. Service bind credential rotation in secrets.
3. AD replication/DC health with infrastructure team.

**Mitigation**: Confirm `PRINCIPAL_PROVIDER` sync can be temporarily disabled if AD is down.

**Escalate** when login and principal sync are both blocked >15 minutes.

**Recovery**: LDAP error rate < 10% for 10 minutes.

## DB pool acquired > 85% of max or p95 acquire > 250ms

**Meaning**: Postgres pool saturation or slow connection acquisition.

**SigNoz query**: `db.client.connections.usage` and pgx pool metrics from otelpgx.

**First checks**:
1. Long-running queries in Postgres (outside Kamino if managed separately).
2. API goroutine and heap panels.
3. Recent traffic spike on heavy inventory routes.

**Mitigation**: Do not restart Postgres without checking active Kamino transactions.

**Escalate** when acquire timeouts appear in traces.

**Recovery**: Pool usage < 70% and p95 acquire < 150ms for 10 minutes.

## kamino.events.dropped increase over 5 minutes

**Meaning**: SSE subscriber buffers are full; clients may miss inventory/request/vm-status events.

**SigNoz query**: `sum(rate(kamino.events.dropped[5m])) by (bus)`.

**First checks**:
1. Active `kamino.sse.connections`.
2. Slow clients or proxies buffering SSE.
3. API CPU throttling.

**Mitigation**: Have affected users refresh; investigate stuck SSE connections.

**Escalate** when drops correlate with missed operational events.

**Recovery**: Zero drop rate increase for 10 minutes.

## Background job stale or failing

**Meaning**: `kamino.background.last_success` is older than twice the schedule or three consecutive `result=error` runs.

**SigNoz query**: `kamino.background.last_success` and `kamino.background.runs` by `job`.

**First checks**:
1. Traces for the specific job (`inventory_listener`, `vm_status_poll`, etc.).
2. Upstream dependency health for sync jobs.
3. `kubectl -n kamino-dev describe pod` for OOM/restarts.

**Mitigation**: Fix root dependency; restart API only after confirming no in-flight Proxmox tasks need reconciliation.

**Escalate** when `vm_status_poll` or `inventory_listener` stale >30 minutes.

**Recovery**: `last_success` within one schedule interval.

## Readiness failure / API restart / collector export failure

**Meaning**: Kubernetes probes fail, pod restarts increase, or k8s-infra collector cannot export OTLP.

**SigNoz query**: Pod restart metrics, readiness probe failures, collector queue errors.

**First checks**:
1. `kubectl -n kamino-dev get pods -w`
2. `kubectl -n signoz logs -l app.kubernetes.io/name=k8s-infra --tail=200`
3. Recent deploy and SigNoz collector health.

**Mitigation**: Separate Kamino outages from SigNoz outages; stdout logs remain available via `kubectl logs`.

**Escalate** when crash loop persists >10 minutes.

**Recovery**: Pod Ready and collector export errors cleared for 10 minutes.
