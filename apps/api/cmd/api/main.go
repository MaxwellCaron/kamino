package main

import (
	"context"
	"fmt"
	"log"

	"github.com/MaxwellCaron/kamino/internal/routes"
	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/joho/godotenv"
	"github.com/kelseyhightower/envconfig"
)

// Config holds all application configuration
type Config struct {
	Port        string `envconfig:"PORT" default:":8080"`
	FrontendURL string `envconfig:"FRONTEND_URL" default:"http://localhost:3000"`
	DatabaseURL string `envconfig:"DATABASE_URL" required:"true"`
}

// Server holds all application dependencies
type Server struct {
	Config *Config
	DBPool *pgxpool.Pool
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

	// Initialize clients/database

	// Initialize services

	// Initialize handlers

	return &Server{
		Config: config,
		DBPool: dbPool,
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

	r := gin.New()

	// Register all API routes
	routes.RegisterRoutes(r)

	r.Run(config.Port)
}
