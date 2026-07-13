package main

import (
	"context"
	"log"
	"strings"
	"time"

	"github.com/MaxwellCaron/kamino/internal/audit"
	"github.com/MaxwellCaron/kamino/internal/auth"
	"github.com/MaxwellCaron/kamino/internal/authorization"
	"github.com/MaxwellCaron/kamino/internal/handlers"
	"github.com/MaxwellCaron/kamino/internal/inventory"
	"github.com/MaxwellCaron/kamino/internal/middleware"
	"github.com/MaxwellCaron/kamino/internal/proxmox"
	"github.com/MaxwellCaron/kamino/internal/proxmox/vmstatus"
	requestqueue "github.com/MaxwellCaron/kamino/internal/requests"
	"github.com/MaxwellCaron/kamino/internal/routes"
	"github.com/MaxwellCaron/kamino/internal/vmactions"
	"github.com/MaxwellCaron/kamino/internal/vmidalloc"
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/joho/godotenv"
	"github.com/kelseyhightower/envconfig"
)

// Config holds all application configuration

// init the environment
func init() {
	if err := godotenv.Load(); err != nil {
		log.Println("No .env file found, using environment variables from system")
	} else {
		log.Println("Loaded configuration from .env file")
	}
}
func main() {
	var config Config
	if err := envconfig.Process("", &config); err != nil {
		log.Fatalf("Failed to process environment configuration: %v", err)
	}
	if err := validatePrincipalProviderConfig(&config); err != nil {
		log.Fatalf("Invalid principal provider configuration: %v", err)
	}
	routerCloneConfig, err := buildPodRouterCloneConfig(&config)
	if err != nil {
		log.Fatalf("Invalid pod router clone configuration: %v", err)
	}
	networkCatalog, err := buildPodNetworkCatalog(routerCloneConfig)
	if err != nil {
		log.Fatalf("Invalid pod network catalog: %v", err)
	}
	vmidRangeConfig, err := buildVMIDRangeConfig(&config)
	if err != nil {
		log.Fatalf("Invalid VMID range configuration: %v", err)
	}

	// Initialize server with all dependencies
	server, err := newServer(&config)
	if err != nil {
		log.Fatalf("Failed to initialize server: %v", err)
	}
	defer server.DBPool.Close()

	runInitialSyncs(
		context.Background(),
		&config,
		server.ProxmoxImport.Run,
		server.PrincipalSync,
	)

	inventoryNotifier := inventory.NewNotifier(server.DBPool)
	go inventoryNotifier.Start(context.Background())
	requestsNotifier := requestqueue.NewNotifier(server.DBPool)
	go requestsNotifier.Start(context.Background())
	vmStatusNotifier := vmstatus.NewNotifier(server.ProxmoxClient)
	go vmStatusNotifier.Start(context.Background())

	proxmoxMirror := proxmox.NewInventoryMirror(server.DBPool, server.ProxmoxClient)
	if proxmoxMirror != nil {
		if err := proxmoxMirror.Reconcile(context.Background()); err != nil {
			log.Printf("Initial Proxmox mirror reconcile failed: %v", err)
		}
	}

	adminGroup, err := resolveBootstrapAdminGroup(context.Background(), server.Config, server.ADClient)
	if err != nil {
		log.Fatalf("Admin group discovery failed: %v", err)
	}
	if strings.TrimSpace(server.Config.PrincipalBootstrapAdminGroup) == "" {
		log.Printf(
			"WARNING: PRINCIPAL_BOOTSTRAP_ADMIN_GROUP is unset; no initial administrator group will be bootstrapped",
		)
	}

	var bootstrapAdminGroups []string
	if adminGroup != nil && strings.TrimSpace(adminGroup.DisplayName) != "" {
		bootstrapAdminGroups = []string{adminGroup.DisplayName}
	}

	protectedACLPrincipalID, err := resolveProtectedAdminGroupPrincipalID(
		context.Background(),
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
		log.Printf("Protected admin group principal discovery failed: %v", err)
	}

	var protectedACLPrincipalIDs []uuid.UUID
	if protectedACLPrincipalID != uuid.Nil {
		protectedACLPrincipalIDs = []uuid.UUID{protectedACLPrincipalID}
	}

	authzService := authorization.NewService(server.DBPool, protectedACLPrincipalIDs)
	if err := authzService.BootstrapRootAccess(
		context.Background(),
		bootstrapAdminGroups,
	); err != nil {
		log.Printf("Inventory ACL bootstrap failed: %v", err)
	}

	// Initialize handlers
	inventoryService := inventory.NewService(
		server.DBPool,
		inventoryNotifier,
		proxmoxMirror,
		protectedACLPrincipalIDs,
	)
	if err := inventoryService.NormalizeInheritance(context.Background()); err != nil {
		log.Printf("Inventory inheritance normalization failed: %v", err)
	}
	auditService := audit.NewService(server.DBPool)
	go auditService.StartRetention(context.Background())
	inventoryHandler := &handlers.InventoryHandler{
		Service:  inventoryService,
		Notifier: inventoryNotifier,
		PX:       server.ProxmoxClient,
		Authz:    authzService,
		Audit:    auditService,
	}
	vncHandler := handlers.NewVNCHandler(server.ProxmoxClient, config.FrontendURL)
	vncHandler.Authz = authzService
	vmActionExecutor := vmactions.NewExecutor(
		server.ProxmoxClient,
		inventoryService,
		vmStatusNotifier,
	)
	vmActionClaims := vmactions.NewClaims(server.DBPool)
	podCloneClaims := vmactions.NewPodCloneClaims(server.DBPool)
	vmHandler := &handlers.VMHandler{
		PX:                    server.ProxmoxClient,
		DB:                    server.DBPool,
		Importer:              server.ProxmoxImport,
		Service:               inventoryService,
		Notifier:              vmStatusNotifier,
		Authz:                 authzService,
		Actions:               vmActionExecutor,
		Claims:                vmActionClaims,
		Audit:                 auditService,
		PersonalPodVNetPrefix: routerCloneConfig.PersonalVNetPrefix,
		PodLANVLANBase:        routerCloneConfig.LANVLANBase,
	}
	vmidAllocator := vmidalloc.New(server.ProxmoxClient)
	vmHandler.Allocator = vmidAllocator
	vmCreateHandler := &handlers.VMCreateHandler{
		PX:                    server.ProxmoxClient,
		DB:                    server.DBPool,
		Importer:              server.ProxmoxImport,
		Service:               inventoryService,
		Authz:                 authzService,
		Audit:                 auditService,
		Allocator:             vmidAllocator,
		PersonalPodVNetPrefix: routerCloneConfig.PersonalVNetPrefix,
		PodLANVLANBase:        routerCloneConfig.LANVLANBase,
	}
	routerTemplateItemID, err := parseOptionalUUID(server.Config.PodRouterTemplate)
	if err != nil {
		log.Fatalf("Invalid POD_ROUTER_TEMPLATE_ITEM_ID: %v", err)
	}
	personalPodRouterTemplateItemID, err := parseOptionalUUID(server.Config.PersonalPodRouterTemplateItemID)
	if err != nil {
		log.Fatalf("Invalid PERSONAL_POD_ROUTER_TEMPLATE_ITEM_ID: %v", err)
	}
	templatesFolderItemID, err := parseOptionalUUID(server.Config.TemplatesFolderItemID)
	if err != nil {
		log.Fatalf("Invalid TEMPLATES_FOLDER_ITEM_ID: %v", err)
	}
	podsFolderItemID, err := parseOptionalUUID(server.Config.PodsFolderItemID)
	if err != nil {
		log.Fatalf("Invalid PODS_FOLDER_ITEM_ID: %v", err)
	}
	personalPodsFolderItemID, err := parseOptionalUUID(server.Config.PersonalPodsFolderItemID)
	if err != nil {
		log.Fatalf("Invalid PERSONAL_PODS_FOLDER_ITEM_ID: %v", err)
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
	}
	if err := podsHandler.EnsurePurposeFolderDescriptions(context.Background()); err != nil {
		log.Printf("Purpose folder description sync failed: %v", err)
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
		podsHandler,
		vmActionClaims,
	)
	requestsHandler := &handlers.RequestsHandler{Service: requestService}

	if fenced, err := requestService.FailStaleExecutingRequests(context.Background()); err != nil {
		log.Printf("Stale executing request recovery failed: %v", err)
	} else if len(fenced) > 0 {
		log.Printf("Recovered %d stranded executing request(s): %v", len(fenced), fenced)
	}

	if swept, err := inventoryService.SweepExpiredFolderVMCapacityReservations(context.Background()); err != nil {
		log.Printf("Expired capacity reservation sweep failed: %v", err)
	} else if swept > 0 {
		log.Printf("Swept %d expired folder VM capacity reservation(s)", swept)
	}

	if swept, err := podCloneClaims.SweepStale(context.Background(), 15*time.Minute); err != nil {
		log.Printf("Stale pod clone claim sweep failed: %v", err)
	} else if swept > 0 {
		log.Printf("Swept %d stale pod clone claim(s)", swept)
	}

	if swept, err := vmActionClaims.SweepStale(context.Background(), vmactions.VMActionClaimStaleAge); err != nil {
		log.Printf("Stale VM action claim sweep failed: %v", err)
	} else if swept > 0 {
		log.Printf("Swept %d stale VM action claim(s)", swept)
	}
	go vmActionClaims.StartRecovery(context.Background())

	eventsHandler := &handlers.EventsHandler{
		InventoryNotifier: inventoryNotifier,
		VMNotifier:        vmStatusNotifier,
		Requests:          requestService,
		Authz:             authzService,
	}

	authService, err := auth.NewService(server.Config.JWTSecret)
	if err != nil {
		log.Fatal(err)
	}

	sessionManager := auth.NewSessionManager(server.DBPool)

	authHandler := &handlers.AuthHandler{
		Auth:          authService,
		Sessions:      sessionManager,
		Authenticator: server.PrincipalAuthenticator,
		Authz:         authzService,
		DB:            server.DBPool,
		CookieSecure:  strings.HasPrefix(server.Config.FrontendURL, "https://"),
	}

	principalsHandler := &handlers.PrincipalsHandler{
		Provider: server.PrincipalProvider,
		Authz:    authzService,
		Audit:    auditService,
		Sessions: sessionManager,
		DB:       server.DBPool,
	}

	r := gin.Default()
	if err := r.SetTrustedProxies(server.Config.TrustedProxyCIDRs); err != nil {
		log.Fatalf("invalid TRUSTED_PROXY_CIDRS: %v", err)
	}
	r.Use(middleware.CORS(server.Config.FrontendURL))

	healthHandler := &handlers.HealthHandler{DB: server.DBPool}

	// Register all API routes
	routes.RegisterRoutes(
		r,
		healthHandler,
		authHandler,
		authService,
		sessionManager,
		inventoryHandler,
		vncHandler,
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

	r.Run(config.Port)
}
