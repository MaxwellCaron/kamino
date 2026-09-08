package main

import (
	"context"
	"fmt"
)

const proxmoxSyncCommand = "proxmox-sync"

func runProxmoxSyncCommand(ctx context.Context, config *Config) error {
	server, err := newServer(config)
	if err != nil {
		return fmt.Errorf("initialize Proxmox sync: %w", err)
	}
	defer server.DBPool.Close()

	return server.ProxmoxImport.SyncAll(ctx)
}
