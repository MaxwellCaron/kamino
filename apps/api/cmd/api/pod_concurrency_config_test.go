package main

import (
	"strings"
	"testing"
)

func TestBuildPodProvisionConcurrencyConfig(t *testing.T) {
	baseConfig := func() Config {
		return Config{PodProvisionConcurrency: 2}
	}

	tests := []struct {
		name    string
		config  Config
		want    int
		wantErr string
	}{
		{
			name:   "minimum accepted",
			config: func() Config { cfg := baseConfig(); cfg.PodProvisionConcurrency = 1; return cfg }(),
			want:   1,
		},
		{
			name:   "default accepted",
			config: baseConfig(),
			want:   2,
		},
		{
			name:   "maximum accepted",
			config: func() Config { cfg := baseConfig(); cfg.PodProvisionConcurrency = 8; return cfg }(),
			want:   8,
		},
		{
			name:    "zero rejected",
			config:  func() Config { cfg := baseConfig(); cfg.PodProvisionConcurrency = 0; return cfg }(),
			wantErr: "POD_PROVISION_CONCURRENCY",
		},
		{
			name:    "above maximum rejected",
			config:  func() Config { cfg := baseConfig(); cfg.PodProvisionConcurrency = 9; return cfg }(),
			wantErr: "POD_PROVISION_CONCURRENCY",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := buildPodProvisionConcurrencyConfig(&tt.config)
			if tt.wantErr != "" {
				if err == nil {
					t.Fatalf("expected error containing %q, got nil", tt.wantErr)
				}
				if !strings.Contains(err.Error(), tt.wantErr) {
					t.Fatalf("error = %q, want substring %q", err.Error(), tt.wantErr)
				}
				return
			}
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			if got != tt.want {
				t.Fatalf("got %d, want %d", got, tt.want)
			}
		})
	}
}
