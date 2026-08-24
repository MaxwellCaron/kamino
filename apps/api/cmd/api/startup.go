package main

import (
	"context"
	"log/slog"

	"github.com/MaxwellCaron/kamino/internal/observability"
)

func runInitialSyncs(
	ctx context.Context,
	config *Config,
	tel *observability.Telemetry,
	proxmoxSync func(context.Context) error,
	principalSync func(context.Context) error,
) {
	if config.ProxmoxInitialSyncEnabled {
		if err := observability.RunBackgroundJob(ctx, tel, observability.JobProxmoxInitialSync, proxmoxSync); err != nil {
			slog.ErrorContext(ctx, "initial proxmox sync failed", slog.String("error", err.Error()))
		}
	} else {
		slog.InfoContext(ctx, "initial proxmox sync disabled by PROXMOX_INITIAL_SYNC_ENABLED")
	}

	if principalSync != nil && config.PrincipalInitialSyncEnabled {
		if err := observability.RunBackgroundJob(ctx, tel, observability.JobPrincipalInitialSync, principalSync); err != nil {
			slog.ErrorContext(ctx, "initial principal sync failed", slog.String("error", err.Error()))
		}
	} else if principalSync != nil {
		slog.InfoContext(ctx, "initial principal sync disabled by PRINCIPAL_INITIAL_SYNC_ENABLED")
	}
}
