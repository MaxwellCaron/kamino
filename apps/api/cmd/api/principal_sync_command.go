package main

import (
	"context"
	"fmt"
)

const principalSyncCommand = "principal-sync"

func runPrincipalSyncCommand(ctx context.Context, config *Config) error {
	server, err := newServer(config)
	if err != nil {
		return fmt.Errorf("initialize principal sync: %w", err)
	}
	defer server.DBPool.Close()

	if server.PrincipalSync == nil {
		return fmt.Errorf("principal sync is unavailable for provider %q", config.PrincipalProvider)
	}
	return server.PrincipalSync(ctx)
}
