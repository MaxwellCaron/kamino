package main

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"net"
	"net/http"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"

	"github.com/MaxwellCaron/kamino/database"
	"github.com/MaxwellCaron/kamino/internal/audit"
	"github.com/MaxwellCaron/kamino/internal/auth"
	"github.com/MaxwellCaron/kamino/internal/authorization"
	"github.com/MaxwellCaron/kamino/internal/handlers"
	"github.com/MaxwellCaron/kamino/internal/inventory"
	"github.com/MaxwellCaron/kamino/internal/middleware"
	"github.com/MaxwellCaron/kamino/internal/observability"
	"github.com/MaxwellCaron/kamino/internal/personalpods"
	"github.com/MaxwellCaron/kamino/internal/podnetwork"
	"github.com/MaxwellCaron/kamino/internal/proxmox/vmstatus"
	requestqueue "github.com/MaxwellCaron/kamino/internal/requests"
	"github.com/MaxwellCaron/kamino/internal/routes"
	"github.com/MaxwellCaron/kamino/internal/vmactions"
	"github.com/MaxwellCaron/kamino/internal/vmidalloc"
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/joho/godotenv"
	"github.com/kelseyhightower/envconfig"
	"go.opentelemetry.io/contrib/instrumentation/github.com/gin-gonic/gin/otelgin"
)

var buildVersion = "dev"

type serveOptions struct {
	listener net.Listener
}

// init the environment
func init() {
	if err := godotenv.Load(); err != nil {
		slog.Info("no .env file found, using environment variables from system")
	} else {
		slog.Info("loaded configuration from .env file")
	}
}

func main() {
	if err := run(); err != nil {
		slog.Error("application failed", slog.String("error", err.Error()))
		os.Exit(1)
	}
}

func run(opts ...func(*serveOptions)) error {
	serveOpts := serveOptions{}
	for _, opt := range opts {
		opt(&serveOpts)
	}

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	var config Config
	if err := envconfig.Process("", &config); err != nil {
		return fmt.Errorf("process environment configuration: %w", err)
	}
	if err := validatePrincipalProviderConfig(&config); err != nil {
		return fmt.Errorf("invalid principal provider configuration: %w", err)
	}

	tel, err := observability.New(ctx, observability.Config{
		Enabled:          config.OTelEnabled,
		OTLPEndpoint:     config.OTelExporterEndpoint,
		TraceSampleRatio: config.OTelTraceSampleRatio,
		DeploymentEnv:    config.DeploymentEnvironment,
		K8sClusterName:   config.OTelK8sClusterName,
		ServiceVersion:   buildVersion,
		K8sNamespace:     config.K8sNamespace,
		K8sPodName:       config.K8sPodName,
		K8sPodUID:        config.K8sPodUID,
	})
	if err != nil {
		return fmt.Errorf("initialize telemetry: %w", err)
	}
	defer func() {
		shutdownCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		_ = tel.Shutdown(shutdownCtx)
	}()

	spiceProxyHost, err := resolveSPICEProxyHost(config.ProxmoxURL, config.ProxmoxSPICEProxyHost)
	if err != nil {
		return fmt.Errorf("invalid SPICE proxy host configuration: %w", err)
	}
	config.ProxmoxSPICEProxyHost = spiceProxyHost
	routerCloneConfig, err := buildPodRouterCloneConfig(&config)
	if err != nil {
		return fmt.Errorf("invalid pod router clone configuration: %w", err)
	}
	networkCatalog, err := podnetwork.NewCatalog()
	if err != nil {
		return fmt.Errorf("invalid pod network catalog: %w", err)
	}
	vmidRangeConfig, err := buildVMIDRangeConfig(&config)
	if err != nil {
		return fmt.Errorf("invalid VMID range configuration: %w", err)
	}
	vmOperationConfig, err := buildVMOperationConfig(&config)
	if err != nil {
		return fmt.Errorf("invalid VM operation concurrency configuration: %w", err)
	}
	vmPowerConfig, err := buildVMPowerConfig(&config)
	if err != nil {
		return fmt.Errorf("invalid VM power configuration: %w", err)
	}

	server, err := newServer(ctx, &config)
	if err != nil {
		return fmt.Errorf("initialize server: %w", err)
	}
	defer server.DBPool.Close()

	runInitialSyncs(ctx, &config, tel, server.ProxmoxImport.Run, server.PrincipalSync)

	inventoryNotifier := inventory.NewNotifier(server.DBPool, tel)
	go inventoryNotifier.Start(ctx)
	requestsNotifier := requestqueue.NewNotifier(server.DBPool, tel)
	go requestsNotifier.Start(ctx)
	vmStatusNotifier := vmstatus.NewNotifier(server.ProxmoxClient, tel)
	go vmStatusNotifier.Start(ctx)

	adminGroup, err := resolveBootstrapAdminGroup(ctx, server.Config, server.ADClient)
	if err != nil {
		return fmt.Errorf("admin group discovery failed: %w", err)
	}
	if strings.TrimSpace(server.Config.PrincipalBootstrapAdminGroup) == "" {
		slog.WarnContext(ctx, "PRINCIPAL_BOOTSTRAP_ADMIN_GROUP is unset; no initial administrator group will be bootstrapped")
	}

	var bootstrapAdminGroups []string
	if adminGroup != nil && strings.TrimSpace(adminGroup.DisplayName) != "" {
		bootstrapAdminGroups = []string{adminGroup.DisplayName}
	}

	protectedACLPrincipalID, err := resolveProtectedAdminGroupPrincipalID(
		ctx,
		server.DBPool,
		configuredPrincipalProviderType(server.Config),
		func() string {
			if adminGroup == nil {
				return ""
			}
			return adminGroup.ExternalID
		}(),
	)
	if err != nil {
		slog.WarnContext(ctx, "protected admin group principal discovery failed", slog.String("error", err.Error()))
	}

	var protectedACLPrincipalIDs []uuid.UUID
	if protectedACLPrincipalID != uuid.Nil {
		protectedACLPrincipalIDs = []uuid.UUID{protectedACLPrincipalID}
	}

	authzService := authorization.NewService(server.DBPool, protectedACLPrincipalIDs)
	if err := authzService.BootstrapRootAccess(
		ctx,
		bootstrapAdminGroups,
	); err != nil {
		slog.WarnContext(ctx, "inventory ACL bootstrap failed", slog.String("error", err.Error()))
	}

	// Initialize handlers
	inventoryService := inventory.NewService(
		server.DBPool,
		inventoryNotifier,
		protectedACLPrincipalIDs,
	)
	if err := inventoryService.NormalizeInheritance(ctx); err != nil {
		slog.WarnContext(ctx, "inventory inheritance normalization failed", slog.String("error", err.Error()))
	}
	auditService := audit.NewService(server.DBPool, tel)
	go auditService.StartRetention(ctx)
	inventoryHandler := &handlers.InventoryHandler{
		Service:            inventoryService,
		Notifier:           inventoryNotifier,
		PX:                 server.ProxmoxClient,
		Authz:              authzService,
		Audit:              auditService,
		PodVMAddressReader: database.New(server.DBPool),
		NetworkCatalog:     networkCatalog,
	}
	vncHandler := handlers.NewVNCHandler(ctx, server.ProxmoxClient, config.FrontendURL, tel)
	vncHandler.Authz = authzService
	consoleHandler := &handlers.ConsoleHandler{
		PX:             server.ProxmoxClient,
		Authz:          authzService,
		SPICEProxyHost: config.ProxmoxSPICEProxyHost,
	}
	vmActionExecutor := vmactions.NewExecutor(
		server.ProxmoxClient,
		inventoryService,
		vmStatusNotifier,
		vmOperationConfig,
		vmPowerConfig,
	)
	vmActionClaims := vmactions.NewClaims(server.DBPool, tel)
	podCloneClaims := vmactions.NewPodCloneClaims(server.DBPool)
	templatesFolderItemID, err := parseOptionalUUID(server.Config.TemplatesFolderItemID)
	if err != nil {
		return fmt.Errorf("invalid TEMPLATES_FOLDER_ITEM_ID: %w", err)
	}
	vmTemplatesFolderItemID, err := resolveVMTemplatesFolderItemID(
		server.Config.VMTemplatesFolderItemID,
		templatesFolderItemID,
	)
	if err != nil {
		return fmt.Errorf("invalid VM_TEMPLATES_FOLDER_ITEM_ID: %w", err)
	}
	vmHandler := &handlers.VMHandler{
		PX:                    server.ProxmoxClient,
		Importer:              server.ProxmoxImport,
		Service:               inventoryService,
		Notifier:              vmStatusNotifier,
		Authz:                 authzService,
		Actions:               vmActionExecutor,
		Claims:                vmActionClaims,
		Audit:                 auditService,
		TemplatesFolderItemID: vmTemplatesFolderItemID,
		TemplateLibrary:       inventoryService,
		NetworkScopeReader:    database.New(server.DBPool),
		NetworkCatalog:        networkCatalog,
	}
	vmidAllocator := vmidalloc.New(server.ProxmoxClient)
	vmHandler.Allocator = vmidAllocator
	vmCreateHandler := &handlers.VMCreateHandler{
		PX:                    server.ProxmoxClient,
		Importer:              server.ProxmoxImport,
		Service:               inventoryService,
		Authz:                 authzService,
		Audit:                 auditService,
		Allocator:             vmidAllocator,
		TemplatesFolderItemID: vmTemplatesFolderItemID,
		TemplateLibrary:       inventoryService,
		NetworkScopeReader:    database.New(server.DBPool),
		NetworkCatalog:        networkCatalog,
	}
	routerTemplateItemID, err := parseOptionalUUID(server.Config.PodRouterTemplate)
	if err != nil {
		return fmt.Errorf("invalid POD_ROUTER_TEMPLATE_ITEM_ID: %w", err)
	}
	personalPodRouterTemplateItemID, err := resolvePersonalPodRouterTemplateItemID(
		server.Config.PersonalPodsEnabled,
		server.Config.PersonalPodRouterTemplateItemID,
		routerTemplateItemID,
	)
	if err != nil {
		return fmt.Errorf("invalid personal pod configuration: %w", err)
	}
	podsFolderItemID, err := parseOptionalUUID(server.Config.PodsFolderItemID)
	if err != nil {
		return fmt.Errorf("invalid PODS_FOLDER_ITEM_ID: %w", err)
	}
	personalPodsFolderItemID, err := parseOptionalUUID(server.Config.PersonalPodsFolderItemID)
	if err != nil {
		return fmt.Errorf("invalid PERSONAL_PODS_FOLDER_ITEM_ID: %w", err)
	}
	podsHandler := &handlers.PodsHandler{
		PX:                              server.ProxmoxClient,
		Importer:                        server.ProxmoxImport,
		Service:                         inventoryService,
		Authz:                           authzService,
		DB:                              server.DBPool,
		Notifier:                        vmStatusNotifier,
		Actions:                         vmActionExecutor,
		RouterTemplateItemID:            routerTemplateItemID,
		PersonalPodRouterTemplateItemID: personalPodRouterTemplateItemID,
		RouterCloneConfig:               routerCloneConfig,
		NetworkCatalog:                  networkCatalog,
		Audit:                           auditService,
		TemplatesFolderItemID:           templatesFolderItemID,
		PodsFolderItemID:                podsFolderItemID,
		PersonalPodsFolderItemID:        personalPodsFolderItemID,
		Allocator:                       vmidAllocator,
		PublishVMIDRange:                vmidRangeConfig.Publish,
		CloneVMIDRange:                  vmidRangeConfig.Clone,
		DevVMIDRange:                    vmidRangeConfig.Dev,
		PersonalVMIDRange:               vmidRangeConfig.Personal,
		PodCloneClaims:                  podCloneClaims,
		VMActionClaims:                  vmActionClaims,
	}
	personalPodRuntime := handlers.NewPersonalPodRuntime(podsHandler)
	podsHandler.PersonalPods = personalpods.NewService(
		server.Config.PersonalPodsEnabled,
		server.DBPool,
		inventoryService,
		auditService,
		personalPodRuntime,
	)
	if err := podsHandler.EnsurePurposeFolderDescriptions(ctx); err != nil {
		slog.WarnContext(ctx, "purpose folder description sync failed", slog.String("error", err.Error()))
	}
	sdnHandler := &handlers.SDNHandler{
		PX:    server.ProxmoxClient,
		Authz: authzService,
		Audit: auditService,
	}
	proxmoxSyncHandler := &handlers.ProxmoxSyncHandler{
		Importer: server.ProxmoxImport,
		Service:  inventoryService,
		Authz:    authzService,
		Audit:    auditService,
	}
	auditHandler := &handlers.AuditHandler{
		Audit: auditService,
		Authz: authzService,
	}
	authzHandler := &handlers.AuthorizationHandler{Authz: authzService, Audit: auditService}
	requestService := requestqueue.NewService(
		server.DBPool,
		authzService,
		inventoryService,
		server.ProxmoxClient,
		vmActionExecutor,
		requestsNotifier,
		auditService,
		podsHandler.PersonalPods,
		vmActionClaims,
	)
	requestsHandler := &handlers.RequestsHandler{Service: requestService}

	if fenced, err := requestService.FailStaleExecutingRequests(ctx); err != nil {
		slog.WarnContext(ctx, "stale executing request recovery failed", slog.String("error", err.Error()))
	} else if len(fenced) > 0 {
		slog.InfoContext(ctx, "recovered stranded executing requests", slog.Int("count", len(fenced)))
	}

	if swept, err := inventoryService.SweepExpiredFolderVMCapacityReservations(ctx); err != nil {
		slog.WarnContext(ctx, "expired capacity reservation sweep failed", slog.String("error", err.Error()))
	} else if swept > 0 {
		slog.InfoContext(ctx, "swept expired folder vm capacity reservations", slog.Int64("count", swept))
	}

	if cleared, err := podCloneClaims.ClearAll(ctx); err != nil {
		slog.WarnContext(ctx, "stranded pod clone claim recovery failed", slog.String("error", err.Error()))
	} else if cleared > 0 {
		slog.InfoContext(ctx, "recovered stranded pod clone claims", slog.Int64("count", cleared))
	}

	if swept, err := vmActionClaims.SweepStale(ctx, vmactions.VMActionClaimStaleAge); err != nil {
		slog.WarnContext(ctx, "stale vm action claim sweep failed", slog.String("error", err.Error()))
	} else if swept > 0 {
		slog.InfoContext(ctx, "swept stale vm action claims", slog.Int64("count", swept))
	}
	go vmActionClaims.StartRecovery(ctx)

	handlers.InitPublishProgressTelemetry(tel)

	eventsHandler := &handlers.EventsHandler{
		InventoryNotifier: inventoryNotifier,
		VMNotifier:        vmStatusNotifier,
		Requests:          requestService,
		Authz:             authzService,
		Telemetry:         tel,
		AppCtx:            ctx,
	}

	authService, err := auth.NewService(server.Config.JWTSecret)
	if err != nil {
		return fmt.Errorf("initialize auth service: %w", err)
	}

	sessionManager := auth.NewSessionManager(server.DBPool, tel)
	go sessionManager.StartCleanup(ctx)
	eventsHandler.Sessions = sessionManager
	vncHandler.Sessions = sessionManager
	vncHandler.AppCtx = ctx

	authHandler := &handlers.AuthHandler{
		Auth:          authService,
		Sessions:      sessionManager,
		Authenticator: server.PrincipalAuthenticator,
		Authz:         authzService,
		DB:            server.DBPool,
		CookieSecure:  strings.HasPrefix(server.Config.FrontendURL, "https://"),
	}

	principalsHandler := &handlers.PrincipalsHandler{
		Provider:     server.PrincipalProvider,
		Authz:        authzService,
		Audit:        auditService,
		Sessions:     sessionManager,
		DB:           server.DBPool,
		CookieSecure: strings.HasPrefix(server.Config.FrontendURL, "https://"),
	}

	gin.SetMode(gin.ReleaseMode)
	r := gin.New()
	r.Use(otelgin.Middleware("kamino-api", otelgin.WithFilter(func(req *http.Request) bool {
		path := req.URL.Path
		return path != "/api/v1/health" && path != "/api/v1/ready"
	})))
	r.Use(middleware.RequestLogger())
	r.Use(middleware.SafeRecovery())
	if err := r.SetTrustedProxies(server.Config.TrustedProxyCIDRs); err != nil {
		return fmt.Errorf("invalid TRUSTED_PROXY_CIDRS: %w", err)
	}
	r.Use(middleware.CORS(server.Config.FrontendURL))

	healthHandler := &handlers.HealthHandler{DB: server.DBPool}

	routes.RegisterRoutes(
		r,
		healthHandler,
		authHandler,
		authService,
		sessionManager,
		inventoryHandler,
		vncHandler,
		consoleHandler,
		vmHandler,
		vmCreateHandler,
		podsHandler,
		sdnHandler,
		principalsHandler,
		authzHandler,
		requestsHandler,
		eventsHandler,
		proxmoxSyncHandler,
		auditHandler,
	)

	httpServer := &http.Server{
		Addr:    config.Port,
		Handler: r,
		BaseContext: func(net.Listener) context.Context {
			return ctx
		},
	}

	var listener net.Listener
	if serveOpts.listener != nil {
		listener = serveOpts.listener
	} else {
		listener, err = net.Listen("tcp", config.Port)
		if err != nil {
			return fmt.Errorf("listen on %s: %w", config.Port, err)
		}
	}

	serverErr := make(chan error, 1)
	go func() {
		err := httpServer.Serve(listener)
		if errors.Is(err, http.ErrServerClosed) {
			serverErr <- nil
			return
		}
		serverErr <- err
	}()

	select {
	case <-ctx.Done():
		shutdownCtx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
		defer cancel()
		if err := httpServer.Shutdown(shutdownCtx); err != nil {
			return fmt.Errorf("http shutdown: %w", err)
		}
	case err := <-serverErr:
		if err != nil {
			return fmt.Errorf("http server: %w", err)
		}
		return nil
	}

	if err := <-serverErr; err != nil {
		return fmt.Errorf("http server after shutdown: %w", err)
	}
	return nil
}
