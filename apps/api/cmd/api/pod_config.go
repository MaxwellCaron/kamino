package main

import (
	"fmt"
	"strings"
	"time"

	podshttp "github.com/MaxwellCaron/kamino/internal/handlers/pods"
)

func buildPodRouterCloneConfig(config *Config) (podshttp.PodRouterCloneConfig, error) {
	waitTimeout, err := time.ParseDuration(strings.TrimSpace(config.PodRouterWait))
	if err != nil {
		return podshttp.PodRouterCloneConfig{}, fmt.Errorf("invalid POD_ROUTER_WAIT_TIMEOUT: %w", err)
	}
	if waitTimeout <= 0 {
		return podshttp.PodRouterCloneConfig{}, fmt.Errorf("POD_ROUTER_WAIT_TIMEOUT must be positive")
	}

	return podshttp.PodRouterCloneConfig{RouterWaitTimeout: waitTimeout}, nil
}
