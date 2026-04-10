package main

import (
	"context"
	"fmt"
	"log"

	"github.com/MaxwellCaron/kamino/internal/handlers"
	"github.com/MaxwellCaron/kamino/internal/inventory"
	"github.com/MaxwellCaron/kamino/internal/principals/activedirectory"
	"github.com/MaxwellCaron/kamino/internal/proxmox"
	"github.com/MaxwellCaron/kamino/internal/proxmox/vmstatus"
	"github.com/MaxwellCaron/kamino/internal/routes"
	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/joho/godotenv"
	"github.com/kelseyhightower/envconfig"
)

// Config holds all application configuration
type Config struct {
	Port               string `envconfig:"PORT" default:":8080"`
	FrontendURL        string `envconfig:"FRONTEND_URL" default:"http://localhost:3000"`
	DatabaseURL        string `envconfig:"DATABASE_URL" required:"true"`
	ProxmoxURL         string `envconfig:"PROXMOX_URL" required:"true"`
	ProxmoxTokenID     string `envconfig:"PROXMOX_TOKEN_ID" required:"true"`
	ProxmoxTokenSecret string `envconfig:"PROXMOX_TOKEN_SECRET" required:"true"`
	ProxmoxInsecure    bool   `envconfig:"PROXMOX_INSECURE" default:"false"`
	LDAPUrl            string `envconfig:"LDAP_URL"`
	LDAPBindDN         string `envconfig:"LDAP_BIND_DN"`
	LDAPBindPassword   string `envconfig:"LDAP_BIND_PASSWORD"`
	LDAPSearchBaseDN   string `envconfig:"LDAP_SEARCH_BASE_DN"`
	LDAPUserOU         string `envconfig:"LDAP_USER_OU"`
	LDAPGroupOU        string `envconfig:"LDAP_GROUP_OU"`
	LDAPInsecure       bool   `envconfig:"LDAP_INSECURE" default:"false"`
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
	pxClient := proxmox.NewClient(
		config.ProxmoxURL,
		config.ProxmoxTokenID,
		config.ProxmoxTokenSecret,
		config.ProxmoxInsecure,
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

	// Initialize handlers
	inventoryService := inventory.NewService(server.DBPool, inventoryNotifier, proxmoxMirror)
	inventoryHandler := &handlers.InventoryHandler{
		Service:  inventoryService,
		Notifier: inventoryNotifier,
		PX:       server.ProxmoxClient,
	}
	vncHandler := handlers.NewVNCHandler(server.ProxmoxClient)
	vmHandler := &handlers.VMHandler{
		PX:       server.ProxmoxClient,
		Service:  inventoryService,
		Notifier: vmStatusNotifier,
	}
	vmCreateHandler := &handlers.VMCreateHandler{
		PX:      server.ProxmoxClient,
		Service: inventoryService,
	}
	sdnHandler := &handlers.SDNHandler{PX: server.ProxmoxClient}

	var principalsHandler *handlers.PrincipalsHandler
	if server.ADClient != nil {
		adService := activedirectory.NewService(server.DBPool, server.ADClient, server.ADSync)
		principalsHandler = &handlers.PrincipalsHandler{
			Provider: adService,
		}
	}

	r := gin.Default()

	// Register all API routes
	routes.RegisterRoutes(r, inventoryHandler, vncHandler, vmHandler, vmCreateHandler, sdnHandler, principalsHandler)

	r.Run(config.Port)
}
