package main

import (
	"context"
	"errors"
	"fmt"
	"log"
	"strings"

	"github.com/MaxwellCaron/kamino/database"
	"github.com/MaxwellCaron/kamino/internal/auth"
	"github.com/MaxwellCaron/kamino/internal/authorization"
	"github.com/MaxwellCaron/kamino/internal/handlers"
	"github.com/MaxwellCaron/kamino/internal/inventory"
	"github.com/MaxwellCaron/kamino/internal/middleware"
	"github.com/MaxwellCaron/kamino/internal/principals/activedirectory"
	"github.com/MaxwellCaron/kamino/internal/proxmox"
	"github.com/MaxwellCaron/kamino/internal/proxmox/vmstatus"
	"github.com/MaxwellCaron/kamino/internal/routes"
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/joho/godotenv"
	"github.com/kelseyhightower/envconfig"
)

// Config holds all application configuration
type Config struct {
	Port                          string `envconfig:"PORT" default:":8080"`
	FrontendURL                   string `envconfig:"FRONTEND_URL" default:"http://localhost:3000"`
	DatabaseURL                   string `envconfig:"DATABASE_URL" required:"true"`
	ProxmoxURL                    string `envconfig:"PROXMOX_URL" required:"true"`
	ProxmoxTokenID                string `envconfig:"PROXMOX_TOKEN_ID" required:"true"`
	ProxmoxTokenSecret            string `envconfig:"PROXMOX_TOKEN_SECRET" required:"true"`
	ProxmoxInsecure               bool   `envconfig:"PROXMOX_INSECURE" default:"false"`
	ProxmoxNodes                  string `envconfig:"PROXMOX_NODES" required:"true"`
	JWTSecret                     string `envconfig:"JWT_SECRET" required:"true"`
	LDAPUrl                       string `envconfig:"LDAP_URL"`
	LDAPBindDN                    string `envconfig:"LDAP_BIND_DN"`
	LDAPBindPassword              string `envconfig:"LDAP_BIND_PASSWORD"`
	LDAPSearchBaseDN              string `envconfig:"LDAP_SEARCH_BASE_DN"`
	LDAPUserOU                    string `envconfig:"LDAP_USER_OU"`
	LDAPGroupOU                   string `envconfig:"LDAP_GROUP_OU"`
	LDAPAdminGroupDN              string `envconfig:"LDAP_ADMIN_GROUP_DN"`
	LDAPInsecure                  bool   `envconfig:"LDAP_INSECURE" default:"false"`
	InventoryBootstrapAdminGroups string `envconfig:"INVENTORY_BOOTSTRAP_ADMIN_GROUPS"`
}

// Server holds all application dependencies
type Server struct {
	Config        *Config
	DBPool        *pgxpool.Pool
	ProxmoxClient *proxmox.Client
	ProxmoxImport *proxmox.InventoryImporter
	ADClient      *activedirectory.Client
	ADSync        *activedirectory.Sync
}

func splitCSV(value string) []string {
	parts := strings.Split(value, ",")
	result := make([]string, 0, len(parts))
	for _, part := range parts {
		trimmed := strings.TrimSpace(part)
		if trimmed == "" {
			continue
		}
		result = append(result, trimmed)
	}
	return result
}

func resolveBootstrapAdminGroups(
	config *Config,
	adClient *activedirectory.Client,
) ([]string, error) {
	groupNames := splitCSV(config.InventoryBootstrapAdminGroups)

	if adClient == nil || strings.TrimSpace(config.LDAPAdminGroupDN) == "" {
		return groupNames, nil
	}

	group, err := adClient.FetchGroupByDN(config.LDAPAdminGroupDN)
	if err != nil {
		return groupNames, fmt.Errorf(
			"fetch admin group from LDAP_ADMIN_GROUP_DN %q: %w",
			config.LDAPAdminGroupDN,
			err,
		)
	}
	if group == nil {
		return groupNames, fmt.Errorf(
			"no group found at LDAP_ADMIN_GROUP_DN %q",
			config.LDAPAdminGroupDN,
		)
	}

	for _, existing := range groupNames {
		if existing == group.Name {
			return groupNames, nil
		}
	}

	return append(groupNames, group.Name), nil
}

func resolveProtectedInventoryACLPrincipalIDs(
	ctx context.Context,
	config *Config,
	dbPool *pgxpool.Pool,
	adClient *activedirectory.Client,
) ([]uuid.UUID, error) {
	if adClient == nil || strings.TrimSpace(config.LDAPAdminGroupDN) == "" {
		return nil, nil
	}

	group, err := adClient.FetchGroupByDN(config.LDAPAdminGroupDN)
	if err != nil {
		return nil, fmt.Errorf(
			"fetch protected admin group from LDAP_ADMIN_GROUP_DN %q: %w",
			config.LDAPAdminGroupDN,
			err,
		)
	}
	if group == nil {
		return nil, fmt.Errorf(
			"no group found at LDAP_ADMIN_GROUP_DN %q",
			config.LDAPAdminGroupDN,
		)
	}
	if strings.TrimSpace(group.SID) == "" {
		return nil, fmt.Errorf(
			"protected admin group at LDAP_ADMIN_GROUP_DN %q does not have a SID",
			config.LDAPAdminGroupDN,
		)
	}

	q := database.New(dbPool)
	providerID, err := q.GetPrincipalProvider(ctx)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, nil
		}
		return nil, fmt.Errorf("load principal provider: %w", err)
	}

	principal, err := q.GetPrincipalByExternalID(ctx, database.GetPrincipalByExternalIDParams{
		ProviderID: providerID,
		ExternalID: group.SID,
	})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, nil
		}
		return nil, fmt.Errorf("load protected admin group principal: %w", err)
	}

	return []uuid.UUID{principal.ID}, nil
}

// init the environment
func init() {
	if err := godotenv.Load(); err != nil {
		log.Println("No .env file found, using environment variables from system")
	} else {
		log.Println("Loaded configuration from .env file")
	}
}

// newServer creates a new server instance with all dependencies initialized
func newServer(config *Config) (*Server, error) {
	// Initialize database connection pool
	dbPool, err := pgxpool.New(context.Background(), config.DatabaseURL)
	if err != nil {
		return nil, fmt.Errorf("unable to create connection pool: %w", err)
	}

	// Verify connection
	if err := dbPool.Ping(context.Background()); err != nil {
		dbPool.Close()
		return nil, fmt.Errorf("unable to ping database: %w", err)
	}

	// Initialize Proxmox client
	proxmoxNodes := splitCSV(config.ProxmoxNodes)
	if len(proxmoxNodes) == 0 {
		return nil, fmt.Errorf("PROXMOX_NODES must contain at least one node")
	}

	pxClient := proxmox.NewClient(
		config.ProxmoxURL,
		config.ProxmoxTokenID,
		config.ProxmoxTokenSecret,
		config.ProxmoxInsecure,
		proxmoxNodes,
	)

	// Initialize sync service
	pxImport := proxmox.NewInventoryImporter(dbPool, pxClient)

	server := &Server{
		Config:        config,
		DBPool:        dbPool,
		ProxmoxClient: pxClient,
		ProxmoxImport: pxImport,
	}

	// Initialize AD client and sync if LDAP is configured
	if config.LDAPUrl != "" {
		adClient := activedirectory.NewClient(
			config.LDAPUrl,
			config.LDAPBindDN,
			config.LDAPBindPassword,
			config.LDAPSearchBaseDN,
			config.LDAPUserOU,
			config.LDAPGroupOU,
			config.LDAPInsecure,
		)
		server.ADClient = adClient
		server.ADSync = activedirectory.NewSync(dbPool, adClient)
	}

	return server, nil
}

func main() {
	var config Config
	if err := envconfig.Process("", &config); err != nil {
		log.Fatalf("Failed to process environment configuration: %v", err)
	}

	// Initialize server with all dependencies
	server, err := newServer(&config)
	if err != nil {
		log.Fatalf("Failed to initialize server: %v", err)
	}
	defer server.DBPool.Close()

	// Run initial Proxmox inventory sync
	if err := server.ProxmoxImport.Run(context.Background()); err != nil {
		log.Printf("Initial Proxmox sync failed: %v", err)
	}

	// Run initial AD sync if configured
	if server.ADSync != nil {
		if err := server.ADSync.Run(context.Background()); err != nil {
			log.Printf("Initial AD sync failed: %v", err)
		}
	}

	inventoryNotifier := inventory.NewNotifier(server.DBPool)
	go inventoryNotifier.Start(context.Background())
	vmStatusNotifier := vmstatus.NewNotifier(server.ProxmoxClient)
	go vmStatusNotifier.Start(context.Background())

	proxmoxMirror := proxmox.NewInventoryMirror(server.DBPool, server.ProxmoxClient)
	if proxmoxMirror != nil {
		if err := proxmoxMirror.Reconcile(context.Background()); err != nil {
			log.Printf("Initial Proxmox mirror reconcile failed: %v", err)
		}
	}

	authzService := authorization.NewService(server.DBPool)
	bootstrapAdminGroups, err := resolveBootstrapAdminGroups(server.Config, server.ADClient)
	if err != nil {
		log.Printf("Inventory ACL admin group discovery failed: %v", err)
		bootstrapAdminGroups = splitCSV(server.Config.InventoryBootstrapAdminGroups)
	}
	if err := authzService.BootstrapRootAccess(
		context.Background(),
		bootstrapAdminGroups,
	); err != nil {
		log.Printf("Inventory ACL bootstrap failed: %v", err)
	}
	protectedACLPrincipalIDs, err := resolveProtectedInventoryACLPrincipalIDs(
		context.Background(),
		server.Config,
		server.DBPool,
		server.ADClient,
	)
	if err != nil {
		log.Printf("Inventory ACL protected group discovery failed: %v", err)
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
	inventoryHandler := &handlers.InventoryHandler{
		Service:  inventoryService,
		Notifier: inventoryNotifier,
		PX:       server.ProxmoxClient,
		Authz:    authzService,
	}
	vncHandler := handlers.NewVNCHandler(server.ProxmoxClient)
	vncHandler.Authz = authzService
	vmHandler := &handlers.VMHandler{
		PX:       server.ProxmoxClient,
		Service:  inventoryService,
		Notifier: vmStatusNotifier,
		Authz:    authzService,
	}
	vmCreateHandler := &handlers.VMCreateHandler{
		PX:      server.ProxmoxClient,
		Service: inventoryService,
		Authz:   authzService,
	}
	sdnHandler := &handlers.SDNHandler{PX: server.ProxmoxClient}

	var authHandler *handlers.AuthHandler
	var authService *auth.Service
	var principalsHandler *handlers.PrincipalsHandler
	if server.ADClient != nil {
		authService, err = auth.NewService(server.Config.JWTSecret)
		if err != nil {
			log.Fatal(err)
		}

		authHandler = &handlers.AuthHandler{
			Auth:         authService,
			Sessions:     auth.NewSessionManager(server.DBPool),
			ADClient:     server.ADClient,
			DB:           server.DBPool,
			CookieSecure: strings.HasPrefix(server.Config.FrontendURL, "https://"),
		}

		adService := activedirectory.NewService(server.DBPool, server.ADClient, server.ADSync)
		principalsHandler = &handlers.PrincipalsHandler{
			Provider: adService,
		}
	}

	r := gin.Default()
	r.Use(middleware.CORS(server.Config.FrontendURL))

	// Register all API routes
	routes.RegisterRoutes(r, authHandler, authService, inventoryHandler, vncHandler, vmHandler, vmCreateHandler, sdnHandler, principalsHandler)

	r.Run(config.Port)
}
