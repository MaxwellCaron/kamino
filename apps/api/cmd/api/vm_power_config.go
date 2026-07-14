package main

import (
	"fmt"
	"log"
	"time"

	"github.com/MaxwellCaron/kamino/internal/vmactions"
)

func buildVMPowerConfig(config *Config) (vmactions.PowerConfig, error) {
	concurrency := config.VMPowerConcurrency
	if concurrency < 1 || concurrency > 20 {
		return vmactions.PowerConfig{}, fmt.Errorf(
			"VM_POWER_CONCURRENCY must be between 1 and 20, got %d",
			concurrency,
		)
	}

	timeoutRaw := config.VMPowerTaskTimeout
	if timeoutRaw == "" {
		return vmactions.PowerConfig{}, fmt.Errorf("VM_POWER_TASK_TIMEOUT must be set")
	}
	timeout, err := time.ParseDuration(timeoutRaw)
	if err != nil {
		return vmactions.PowerConfig{}, fmt.Errorf("VM_POWER_TASK_TIMEOUT is invalid: %w", err)
	}
	if timeout <= 0 {
		return vmactions.PowerConfig{}, fmt.Errorf(
			"VM_POWER_TASK_TIMEOUT must be positive, got %s",
			timeoutRaw,
		)
	}

	powerConfig := vmactions.PowerConfig{
		Concurrency: concurrency,
		TaskTimeout: timeout,
	}
	log.Printf(
		"VM power concurrency configured: concurrency=%d task_timeout=%s",
		powerConfig.Concurrency,
		powerConfig.TaskTimeout,
	)
	return powerConfig, nil
}
