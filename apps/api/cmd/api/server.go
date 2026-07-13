package main

import (
	"context"
	"fmt"

	"github.com/MaxwellCaron/kamino/internal/principals"
	"github.com/MaxwellCaron/kamino/internal/principals/activedirectory"
	"github.com/MaxwellCaron/kamino/internal/proxmox"
	"github.com/jackc/pgx/v5/pgxpool"
)

// Config holds all application configuration

// Server holds all application dependencies
type Server struct {
	Config                 *Config
	DBPool                 *pgxpool.Pool
	ProxmoxClient          *proxmox.Client
	ProxmoxImport          *proxmox.InventoryImporter
	ADClient               *activedirectory.Client
	PrincipalProvider      principals.Provider
	PrincipalAuthenticator principals.Authenticator
	PrincipalSync          func(context.Context) error
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
	pxClient.SetSharedStorageNames(splitCSV(config.ProxmoxSharedStorageNames))

	// Initialize sync service
	pxImport := proxmox.NewInventoryImporter(dbPool, pxClient)

	server := &Server{
		Config:        config,
		DBPool:        dbPool,
		ProxmoxClient: pxClient,
		ProxmoxImport: pxImport,
	}

	if err := server.wirePrincipalProvider(); err != nil {
		dbPool.Close()
		return nil, err
	}

	return server, nil
}
