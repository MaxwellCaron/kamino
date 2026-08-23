package main

import (
	"fmt"
	"log"

	"github.com/MaxwellCaron/kamino/internal/vmactions"
)

func buildVMOperationConfig(config *Config) (vmactions.OperationConfig, error) {
	concurrency := config.VMOperationConcurrency
	if concurrency < 1 || concurrency > 8 {
		return vmactions.OperationConfig{}, fmt.Errorf(
			"VM_OPERATION_CONCURRENCY must be between 1 and 8, got %d",
			concurrency,
		)
	}

	operationConfig := vmactions.OperationConfig{Concurrency: concurrency}
	log.Printf("VM operation concurrency configured: %d", operationConfig.Concurrency)
	return operationConfig, nil
}
