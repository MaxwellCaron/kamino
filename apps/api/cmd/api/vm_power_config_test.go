package main

import (
	"strings"
	"testing"
	"time"
)

func TestBuildVMPowerConfig(t *testing.T) {
	baseConfig := func() Config {
		return Config{
			VMPowerConcurrency: 6,
			VMPowerTaskTimeout: "5m",
		}
	}

	tests := []struct {
		name    string
		config  Config
		want    int
		wantDur time.Duration
		wantErr string
	}{
		{
			name:    "minimum accepted",
			config:  func() Config { cfg := baseConfig(); cfg.VMPowerConcurrency = 1; return cfg }(),
			want:    1,
			wantDur: 5 * time.Minute,
		},
		{
			name:    "default accepted",
			config:  baseConfig(),
			want:    6,
			wantDur: 5 * time.Minute,
		},
		{
			name:    "ten accepted",
			config:  func() Config { cfg := baseConfig(); cfg.VMPowerConcurrency = 10; return cfg }(),
			want:    10,
			wantDur: 5 * time.Minute,
		},
		{
			name:    "maximum accepted",
			config:  func() Config { cfg := baseConfig(); cfg.VMPowerConcurrency = 20; return cfg }(),
			want:    20,
			wantDur: 5 * time.Minute,
		},
		{
			name:    "zero rejected",
			config:  func() Config { cfg := baseConfig(); cfg.VMPowerConcurrency = 0; return cfg }(),
			wantErr: "VM_POWER_CONCURRENCY",
		},
		{
			name:    "above maximum rejected",
			config:  func() Config { cfg := baseConfig(); cfg.VMPowerConcurrency = 21; return cfg }(),
			wantErr: "VM_POWER_CONCURRENCY",
		},
		{
			name:    "valid duration",
			config:  func() Config { cfg := baseConfig(); cfg.VMPowerTaskTimeout = "10m"; return cfg }(),
			want:    6,
			wantDur: 10 * time.Minute,
		},
		{
			name:    "malformed duration rejected",
			config:  func() Config { cfg := baseConfig(); cfg.VMPowerTaskTimeout = "not-a-duration"; return cfg }(),
			wantErr: "VM_POWER_TASK_TIMEOUT",
		},
		{
			name:    "zero duration rejected",
			config:  func() Config { cfg := baseConfig(); cfg.VMPowerTaskTimeout = "0s"; return cfg }(),
			wantErr: "VM_POWER_TASK_TIMEOUT",
		},
		{
			name:    "negative duration rejected",
			config:  func() Config { cfg := baseConfig(); cfg.VMPowerTaskTimeout = "-1m"; return cfg }(),
			wantErr: "VM_POWER_TASK_TIMEOUT",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := buildVMPowerConfig(&tt.config)
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
			if got.Concurrency != tt.want {
				t.Fatalf("concurrency = %d, want %d", got.Concurrency, tt.want)
			}
			if got.TaskTimeout != tt.wantDur {
				t.Fatalf("task timeout = %s, want %s", got.TaskTimeout, tt.wantDur)
			}
		})
	}
}
