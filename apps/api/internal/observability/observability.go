package observability

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"os"
	"strings"
	"sync"
	"time"

	"go.opentelemetry.io/contrib/bridges/otelslog"
	"go.opentelemetry.io/contrib/instrumentation/runtime"
	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/attribute"
	"go.opentelemetry.io/otel/codes"
	"go.opentelemetry.io/otel/exporters/otlp/otlplog/otlploghttp"
	"go.opentelemetry.io/otel/exporters/otlp/otlpmetric/otlpmetrichttp"
	"go.opentelemetry.io/otel/exporters/otlp/otlptrace/otlptracehttp"
	"go.opentelemetry.io/otel/log/global"
	"go.opentelemetry.io/otel/metric"
	"go.opentelemetry.io/otel/propagation"
	sdklog "go.opentelemetry.io/otel/sdk/log"
	sdkmetric "go.opentelemetry.io/otel/sdk/metric"
	"go.opentelemetry.io/otel/sdk/resource"
	sdktrace "go.opentelemetry.io/otel/sdk/trace"
	semconv "go.opentelemetry.io/otel/semconv/v1.37.0"
	"go.opentelemetry.io/otel/trace"
)

const serviceName = "kamino-api"

type Config struct {
	Enabled          bool
	OTLPEndpoint     string
	TraceSampleRatio float64
	DeploymentEnv    string
	K8sClusterName   string
	ServiceVersion   string
	K8sNamespace     string
	K8sPodName       string
	K8sPodUID        string
}

type Telemetry struct {
	enabled        bool
	tracerProvider *sdktrace.TracerProvider
	meterProvider  *sdkmetric.MeterProvider
	loggerProvider *sdklog.LoggerProvider
	shutdownOnce   sync.Once
	shutdownErr    error
	metrics        *Metrics
	logger         *slog.Logger
	tracer         trace.Tracer
}

func New(ctx context.Context, cfg Config) (*Telemetry, error) {
	if !cfg.Enabled {
		logger := slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{Level: slog.LevelInfo}))
		slog.SetDefault(logger)
		installLogBridge(logger)
		return &Telemetry{
			enabled: false,
			metrics: noopMetrics(),
			logger:  logger,
			tracer:  otel.Tracer(serviceName),
		}, nil
	}

	if err := validateConfig(cfg); err != nil {
		return nil, err
	}

	res, err := buildResource(ctx, cfg)
	if err != nil {
		return nil, err
	}

	otel.SetTextMapPropagator(propagation.NewCompositeTextMapPropagator(
		propagation.TraceContext{},
		propagation.Baggage{},
	))

	traceExporter, err := otlptracehttp.New(ctx,
		otlptracehttp.WithEndpointURL(cfg.OTLPEndpoint),
		otlptracehttp.WithInsecure(),
	)
	if err != nil {
		return nil, fmt.Errorf("create trace exporter: %w", err)
	}

	sampler := sdktrace.ParentBased(sdktrace.TraceIDRatioBased(cfg.TraceSampleRatio))
	tracerProvider := sdktrace.NewTracerProvider(
		sdktrace.WithBatcher(traceExporter),
		sdktrace.WithResource(res),
		sdktrace.WithSampler(sampler),
	)

	metricExporter, err := otlpmetrichttp.New(ctx,
		otlpmetrichttp.WithEndpointURL(cfg.OTLPEndpoint),
		otlpmetrichttp.WithInsecure(),
	)
	if err != nil {
		_ = tracerProvider.Shutdown(ctx)
		return nil, fmt.Errorf("create metric exporter: %w", err)
	}
	meterProvider := sdkmetric.NewMeterProvider(
		sdkmetric.WithResource(res),
		sdkmetric.WithReader(sdkmetric.NewPeriodicReader(metricExporter)),
	)

	logExporter, err := otlploghttp.New(ctx,
		otlploghttp.WithEndpointURL(cfg.OTLPEndpoint),
		otlploghttp.WithInsecure(),
	)
	if err != nil {
		_ = tracerProvider.Shutdown(ctx)
		_ = meterProvider.Shutdown(ctx)
		return nil, fmt.Errorf("create log exporter: %w", err)
	}
	loggerProvider := sdklog.NewLoggerProvider(
		sdklog.WithResource(res),
		sdklog.WithProcessor(sdklog.NewBatchProcessor(logExporter)),
	)

	otel.SetTracerProvider(tracerProvider)
	otel.SetMeterProvider(meterProvider)
	global.SetLoggerProvider(loggerProvider)

	if err := runtime.Start(runtime.WithMinimumReadMemStatsInterval(time.Second)); err != nil {
		_ = tracerProvider.Shutdown(ctx)
		_ = meterProvider.Shutdown(ctx)
		_ = loggerProvider.Shutdown(ctx)
		return nil, fmt.Errorf("start runtime metrics: %w", err)
	}

	stdoutHandler := slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{Level: slog.LevelInfo})
	otelHandler := otelslog.NewHandler(serviceName, otelslog.WithLoggerProvider(loggerProvider))
	logger := slog.New(&multiHandler{handlers: []slog.Handler{stdoutHandler, otelHandler}})
	slog.SetDefault(logger)
	installLogBridge(logger)

	metrics, err := newMetrics(meterProvider.Meter(serviceName))
	if err != nil {
		_ = tracerProvider.Shutdown(ctx)
		_ = meterProvider.Shutdown(ctx)
		_ = loggerProvider.Shutdown(ctx)
		return nil, fmt.Errorf("create metrics: %w", err)
	}

	return &Telemetry{
		enabled:        true,
		tracerProvider: tracerProvider,
		meterProvider:  meterProvider,
		loggerProvider: loggerProvider,
		metrics:        metrics,
		logger:         logger,
		tracer:         tracerProvider.Tracer(serviceName),
	}, nil
}

func validateConfig(cfg Config) error {
	if strings.TrimSpace(cfg.OTLPEndpoint) == "" {
		return errors.New("OTEL_EXPORTER_OTLP_ENDPOINT is required when OTEL_ENABLED is true")
	}
	if cfg.TraceSampleRatio < 0 || cfg.TraceSampleRatio > 1 {
		return errors.New("OTEL_TRACE_SAMPLE_RATIO must be between 0 and 1")
	}
	env := strings.TrimSpace(cfg.DeploymentEnv)
	if env != "local" {
		cluster := strings.TrimSpace(cfg.K8sClusterName)
		if cluster == "" {
			return errors.New("OTEL_K8S_CLUSTER_NAME is required when DEPLOYMENT_ENVIRONMENT is not local")
		}
		if cluster == clusterNamePlaceholder {
			return fmt.Errorf("OTEL_K8S_CLUSTER_NAME must be replaced from placeholder %q", clusterNamePlaceholder)
		}
	}
	return nil
}

func buildResource(ctx context.Context, cfg Config) (*resource.Resource, error) {
	attrs := []attribute.KeyValue{
		semconv.ServiceName(serviceName),
		attribute.String("service.namespace", "kamino"),
		semconv.ServiceVersion(cfg.ServiceVersion),
		semconv.DeploymentEnvironmentName(cfg.DeploymentEnv),
	}
	if cluster := strings.TrimSpace(cfg.K8sClusterName); cluster != "" {
		attrs = append(attrs, semconv.K8SClusterName(cluster))
	}
	if ns := strings.TrimSpace(cfg.K8sNamespace); ns != "" {
		attrs = append(attrs, semconv.K8SNamespaceName(ns))
	}
	if pod := strings.TrimSpace(cfg.K8sPodName); pod != "" {
		attrs = append(attrs, semconv.K8SPodName(pod))
	}
	if uid := strings.TrimSpace(cfg.K8sPodUID); uid != "" {
		attrs = append(attrs, semconv.K8SPodUID(uid))
	}

	detected, err := resource.New(ctx,
		resource.WithFromEnv(),
		resource.WithProcess(),
		resource.WithOS(),
		resource.WithContainer(),
		resource.WithHost(),
	)
	if err != nil {
		return nil, fmt.Errorf("detect resource: %w", err)
	}

	return resource.Merge(detected, resource.NewWithAttributes(semconv.SchemaURL, attrs...))
}

func (t *Telemetry) Enabled() bool { return t.enabled }

func (t *Telemetry) Tracer() trace.Tracer { return t.tracer }

func (t *Telemetry) Metrics() *Metrics { return t.metrics }

func (t *Telemetry) Logger() *slog.Logger { return t.logger }

func (t *Telemetry) Shutdown(ctx context.Context) error {
	t.shutdownOnce.Do(func() {
		var errs []error
		if t.loggerProvider != nil {
			errs = append(errs, t.loggerProvider.Shutdown(ctx))
		}
		if t.meterProvider != nil {
			errs = append(errs, t.meterProvider.Shutdown(ctx))
		}
		if t.tracerProvider != nil {
			errs = append(errs, t.tracerProvider.Shutdown(ctx))
		}
		t.shutdownErr = errors.Join(errs...)
	})
	return t.shutdownErr
}

func RunBackgroundJob(
	ctx context.Context,
	tel *Telemetry,
	job string,
	fn func(context.Context) error,
) error {
	if tel == nil {
		return fn(ctx)
	}
	start := time.Now()
	ctx, span := tel.Tracer().Start(ctx, "kamino.background."+job)
	defer span.End()

	err := fn(ctx)
	result := BackgroundResultSuccess
	switch {
	case err != nil && errors.Is(err, context.Canceled):
		result = BackgroundResultCanceled
	case err != nil:
		result = BackgroundResultError
		span.RecordError(err)
		span.SetStatus(codes.Error, "error")
	}

	jobAttrs := metric.WithAttributes(attribute.String("job", job))
	resultAttrs := metric.WithAttributes(
		attribute.String("job", job),
		attribute.String("result", result),
	)
	duration := time.Since(start).Seconds()
	m := tel.Metrics()
	m.BackgroundDuration.Record(ctx, duration, resultAttrs)
	m.BackgroundRuns.Add(ctx, 1, resultAttrs)
	if result == BackgroundResultSuccess {
		m.BackgroundLastSuccess.Record(ctx, float64(time.Now().Unix()), jobAttrs)
	}
	return err
}
