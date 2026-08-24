package activedirectory

import (
	"context"
	"strings"

	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/attribute"
	"go.opentelemetry.io/otel/codes"
	semconv "go.opentelemetry.io/otel/semconv/v1.37.0"
	"go.opentelemetry.io/otel/trace"
)

func (c *Client) serverAddress() string {
	host, err := c.ldapHost()
	if err != nil {
		return "ldap"
	}
	return host
}

func startLDAPSpan(ctx context.Context, name, serverAddress string) (context.Context, trace.Span) {
	ctx, span := otel.Tracer("kamino-api").Start(ctx, name, trace.WithSpanKind(trace.SpanKindClient))
	span.SetAttributes(
		semconv.ServerAddress(serverAddress),
		attribute.String("peer.service", "ldap"),
	)
	return ctx, span
}

func finishLDAPSpan(span trace.Span, err error, expectedAuthFailure bool) {
	if err == nil {
		return
	}
	if expectedAuthFailure && strings.Contains(err.Error(), "invalid credentials") {
		return
	}
	span.RecordError(err)
	span.SetStatus(codes.Error, "ldap operation failed")
}
