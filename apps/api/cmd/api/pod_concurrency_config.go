package main

import (
	"fmt"
	"log"
)

func buildPodProvisionConcurrencyConfig(config *Config) (int, error) {
	limit := config.PodProvisionConcurrency
	if limit < 1 || limit > 8 {
		return 0, fmt.Errorf("POD_PROVISION_CONCURRENCY must be between 1 and 8, got %d", limit)
	}

	log.Printf("Pod provision concurrency configured: %d", limit)
	return limit, nil
}
