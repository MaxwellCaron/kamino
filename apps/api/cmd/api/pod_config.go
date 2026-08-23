package main

import (
	"fmt"
	"strings"
	"time"

	"github.com/MaxwellCaron/kamino/internal/handlers"
)

func buildPodRouterCloneConfig(config *Config) (handlers.PodRouterCloneConfig, error) {
	waitTimeout, err := time.ParseDuration(strings.TrimSpace(config.PodRouterWait))
	if err != nil {
		return handlers.PodRouterCloneConfig{}, fmt.Errorf("invalid POD_ROUTER_WAIT_TIMEOUT: %w", err)
	}
	if waitTimeout <= 0 {
		return handlers.PodRouterCloneConfig{}, fmt.Errorf("POD_ROUTER_WAIT_TIMEOUT must be positive")
	}

	return handlers.PodRouterCloneConfig{RouterWaitTimeout: waitTimeout}, nil
}
