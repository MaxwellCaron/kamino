package proxmox

import (
	"context"
	"fmt"
	"net/http"
	"regexp"
	"strings"
	"time"

	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/attribute"
	"go.opentelemetry.io/otel/codes"
	semconv "go.opentelemetry.io/otel/semconv/v1.37.0"
	"go.opentelemetry.io/otel/trace"
)

var (
	reNodePath      = regexp.MustCompile(`/nodes/[^/]+`)
	reGuestPath     = regexp.MustCompile(`/(qemu|lxc)/\d+`)
	reStoragePath   = regexp.MustCompile(`/storage/[^/]+`)
	reTaskPath      = regexp.MustCompile(`/tasks/[^/]+`)
	reSnapshotPath  = regexp.MustCompile(`/snapshot/[^/]+`)
	reAccessPath    = regexp.MustCompile(`/access/[^/]+`)
	rePoolPath      = regexp.MustCompile(`/pools/[^/]+`)
	reVNetPath      = regexp.MustCompile(`/sdn/vnets/[^/]+`)
	rePrincipalPath = regexp.MustCompile(`/access/users/[^/]+`)
)

func normalizeProxmoxPath(path string) string {
	if idx := strings.Index(path, "?"); idx >= 0 {
		path = path[:idx]
	}
	path = reNodePath.ReplaceAllString(path, "/nodes/{node}")
	path = reGuestPath.ReplaceAllString(path, "/{guestType}/{vmid}")
	path = reStoragePath.ReplaceAllString(path, "/storage/{storage}")
	path = reTaskPath.ReplaceAllString(path, "/tasks/{task}")
	path = reSnapshotPath.ReplaceAllString(path, "/snapshot/{snapshot}")
	path = reAccessPath.ReplaceAllString(path, "/access/{principal}")
	path = rePrincipalPath.ReplaceAllString(path, "/access/users/{principal}")
	path = rePoolPath.ReplaceAllString(path, "/pools/{pool}")
	path = reVNetPath.ReplaceAllString(path, "/sdn/vnets/{vnet}")
	return path
}

type otelTransport struct {
	base   http.RoundTripper
	tracer trace.Tracer
	host   string
}

func (t *otelTransport) RoundTrip(req *http.Request) (*http.Response, error) {
	method := req.Method
	spanName := "Proxmox " + method
	path := req.URL.Path
	normalized := normalizeProxmoxPath(path)

	ctx, span := t.tracer.Start(req.Context(), spanName, trace.WithSpanKind(trace.SpanKindClient))
	defer span.End()

	span.SetAttributes(
		semconv.HTTPRequestMethodKey.String(method),
		semconv.ServerAddress(t.host),
		attribute.String("peer.service", "proxmox"),
		attribute.String("http.route", normalized),
	)

	start := time.Now()
	resp, err := t.base.RoundTrip(req.WithContext(ctx))
	duration := time.Since(start)
	span.SetAttributes(attribute.Float64("http.client.request.duration", duration.Seconds()))

	if err != nil {
		span.RecordError(err)
		span.SetStatus(codes.Error, "request failed")
		return resp, err
	}

	span.SetAttributes(semconv.HTTPResponseStatusCode(resp.StatusCode))
	if resp.StatusCode >= 400 {
		span.SetStatus(codes.Error, fmt.Sprintf("HTTP %d", resp.StatusCode))
	}
	return resp, err
}

func wrapTransport(transport http.RoundTripper, baseURL string) http.RoundTripper {
	host := baseURL
	if u, err := http.NewRequest(http.MethodGet, baseURL, nil); err == nil && u.URL != nil {
		host = u.URL.Host
	}
	return &otelTransport{
		base:   transport,
		tracer: otel.Tracer("kamino-api"),
		host:   host,
	}
}

func startProxmoxSpan(ctx context.Context, name string) (context.Context, trace.Span) {
	return otel.Tracer("kamino-api").Start(ctx, name, trace.WithSpanKind(trace.SpanKindClient))
}
