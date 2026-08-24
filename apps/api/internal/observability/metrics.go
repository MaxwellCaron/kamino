package observability

import (
	"go.opentelemetry.io/otel/metric"
	sdkmetric "go.opentelemetry.io/otel/sdk/metric"
)

const clusterNamePlaceholder = "REPLACE_WITH_K8S_CLUSTER_NAME"

const (
	CloseReasonClientCancel       = "client_cancel"
	CloseReasonSessionInvalid     = "session_invalid"
	CloseReasonAuthorizationError = "authorization_error"
	CloseReasonWriteError         = "write_error"
	CloseReasonUpstreamError      = "upstream_error"
	CloseReasonServerShutdown     = "server_shutdown"
)

const (
	EventBusInventory       = "inventory"
	EventBusRequests        = "requests"
	EventBusVMStatus        = "vm_status"
	EventBusPublishProgress = "publish_progress"
)

const (
	JobProxmoxInitialSync   = "proxmox_initial_sync"
	JobPrincipalInitialSync = "principal_initial_sync"
	JobVMStatusPoll         = "vm_status_poll"
	JobInventoryListener    = "inventory_listener"
	JobRequestsListener     = "requests_listener"
	JobAuditRetention       = "audit_retention"
	JobSessionCleanup       = "session_cleanup"
	JobVMClaimRecovery      = "vm_claim_recovery"
)

const (
	BackgroundResultSuccess  = "success"
	BackgroundResultError    = "error"
	BackgroundResultCanceled = "canceled"
)

const (
	VNCDirectionClientToUpstream = "client_to_upstream"
	VNCDirectionUpstreamToClient = "upstream_to_client"
)

type Metrics struct {
	SSEConnections        metric.Int64UpDownCounter
	SSEConnectionDuration metric.Float64Histogram
	SSEEventsSent         metric.Int64Counter
	SSEDisconnects        metric.Int64Counter

	VNCConnections        metric.Int64UpDownCounter
	VNCConnectionDuration metric.Float64Histogram
	VNCBytes              metric.Int64Counter

	EventsDelivered metric.Int64Counter
	EventsDropped   metric.Int64Counter

	BackgroundDuration    metric.Float64Histogram
	BackgroundRuns        metric.Int64Counter
	BackgroundLastSuccess metric.Float64Gauge
}

func newMetrics(meter metric.Meter) (*Metrics, error) {
	sseConnections, err := meter.Int64UpDownCounter("kamino.sse.connections")
	if err != nil {
		return nil, err
	}
	sseDuration, err := meter.Float64Histogram("kamino.sse.connection.duration", metric.WithUnit("s"))
	if err != nil {
		return nil, err
	}
	sseEvents, err := meter.Int64Counter("kamino.sse.events.sent")
	if err != nil {
		return nil, err
	}
	sseDisconnects, err := meter.Int64Counter("kamino.sse.disconnects")
	if err != nil {
		return nil, err
	}

	vncConnections, err := meter.Int64UpDownCounter("kamino.vnc.connections")
	if err != nil {
		return nil, err
	}
	vncDuration, err := meter.Float64Histogram("kamino.vnc.connection.duration", metric.WithUnit("s"))
	if err != nil {
		return nil, err
	}
	vncBytes, err := meter.Int64Counter("kamino.vnc.bytes")
	if err != nil {
		return nil, err
	}

	delivered, err := meter.Int64Counter("kamino.events.delivered")
	if err != nil {
		return nil, err
	}
	dropped, err := meter.Int64Counter("kamino.events.dropped")
	if err != nil {
		return nil, err
	}

	bgDuration, err := meter.Float64Histogram("kamino.background.duration", metric.WithUnit("s"))
	if err != nil {
		return nil, err
	}
	bgRuns, err := meter.Int64Counter("kamino.background.runs")
	if err != nil {
		return nil, err
	}
	bgLastSuccess, err := meter.Float64Gauge("kamino.background.last_success")
	if err != nil {
		return nil, err
	}

	return &Metrics{
		SSEConnections:        sseConnections,
		SSEConnectionDuration: sseDuration,
		SSEEventsSent:         sseEvents,
		SSEDisconnects:        sseDisconnects,
		VNCConnections:        vncConnections,
		VNCConnectionDuration: vncDuration,
		VNCBytes:              vncBytes,
		EventsDelivered:       delivered,
		EventsDropped:         dropped,
		BackgroundDuration:    bgDuration,
		BackgroundRuns:        bgRuns,
		BackgroundLastSuccess: bgLastSuccess,
	}, nil
}

func noopMetrics() *Metrics {
	meter := noopMeterProvider.Meter("kamino-api")
	m, _ := newMetrics(meter)
	return m
}

var noopMeterProvider = sdkmetric.NewMeterProvider()
