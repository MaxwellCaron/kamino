package main

import (
	"context"
	"fmt"
	"log"

	activedirectory "github.com/MaxwellCaron/kamino/internal/active_directory"
	"github.com/MaxwellCaron/kamino/internal/handlers"
	"github.com/MaxwellCaron/kamino/internal/proxmox"
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
	LDAPInsecure       bool   `envconfig:"LDAP_INSECURE" default:"false"`
}

// Server holds all application dependencies
type Server struct {
	Config        *Config
	DBPool        *pgxpool.Pool
	ProxmoxClient *proxmox.Client
	ProxmoxSync   *proxmox.Sync
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
	pxSync := proxmox.NewSync(dbPool, pxClient)

	server := &Server{
		Config:        config,
		DBPool:        dbPool,
		ProxmoxClient: pxClient,
		ProxmoxSync:   pxSync,
	}

	// Initialize AD client and sync if LDAP is configured
	if config.LDAPUrl != "" {
		adClient := activedirectory.NewClient(
			config.LDAPUrl,
			config.LDAPBindDN,
			config.LDAPBindPassword,
			config.LDAPSearchBaseDN,
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
	if err := server.ProxmoxSync.Run(context.Background()); err != nil {
		log.Printf("Initial Proxmox sync failed: %v", err)
	}

	// Run initial AD sync if configured
	if server.ADSync != nil {
		if err := server.ADSync.Run(context.Background()); err != nil {
			log.Printf("Initial AD sync failed: %v", err)
		}
	}

	// Initialize handlers
	inventoryHandler := &handlers.InventoryHandler{DB: server.DBPool}
	vncHandler := handlers.NewVNCHandler(server.ProxmoxClient)
	vmHandler := &handlers.VMHandler{PX: server.ProxmoxClient, DB: server.DBPool}
	vmCreateHandler := &handlers.VMCreateHandler{PX: server.ProxmoxClient}
	sdnHandler := &handlers.SDNHandler{PX: server.ProxmoxClient}

	var principalsHandler *handlers.PrincipalsHandler
	if server.ADClient != nil {
		principalsHandler = &handlers.PrincipalsHandler{
			DB:     server.DBPool,
			AD:     server.ADClient,
			ADSync: server.ADSync,
		}
	}

	r := gin.Default()

	// Register all API routes
	routes.RegisterRoutes(r, inventoryHandler, vncHandler, vmHandler, vmCreateHandler, sdnHandler, principalsHandler)

	r.Run(config.Port)
}
