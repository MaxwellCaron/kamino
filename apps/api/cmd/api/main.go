package main

import (
	"context"
	"fmt"
	"log"

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
}

// Server holds all application dependencies
type Server struct {
	Config        *Config
	DBPool        *pgxpool.Pool
	ProxmoxClient *proxmox.Client
	ProxmoxSync   *proxmox.Sync
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

	return &Server{
		Config:        config,
		DBPool:        dbPool,
		ProxmoxClient: pxClient,
		ProxmoxSync:   pxSync,
	}, nil
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

	// Initialize handlers
	inventoryHandler := &handlers.InventoryHandler{DB: server.DBPool}

	r := gin.Default()

	// Register all API routes
	routes.RegisterRoutes(r, inventoryHandler)

	r.Run(config.Port)
}
