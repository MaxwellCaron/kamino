package main

import (
	"context"
	"log"
)

// Config holds all application configuration

func runInitialSyncs(
	ctx context.Context,
	config *Config,
	proxmoxSync func(context.Context) error,
	principalSync func(context.Context) error,
) {
	if config.ProxmoxInitialSyncEnabled {
		if err := proxmoxSync(ctx); err != nil {
			log.Printf("Initial Proxmox sync failed: %v", err)
		}
	} else {
		log.Printf("Initial Proxmox sync disabled by PROXMOX_INITIAL_SYNC_ENABLED")
	}

	if principalSync != nil && config.PrincipalInitialSyncEnabled {
		if err := principalSync(ctx); err != nil {
			log.Printf("Initial principal sync failed: %v", err)
		}
	} else if principalSync != nil {
		log.Printf("Initial principal sync disabled by PRINCIPAL_INITIAL_SYNC_ENABLED")
	}
}
