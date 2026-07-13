package main

import (
	"context"
	"errors"
	"os"
	"strings"
	"testing"

	"github.com/kelseyhightower/envconfig"
)

func TestInitialSyncConfig(t *testing.T) {
	const (
		proxmoxFlag   = "PROXMOX_INITIAL_SYNC_ENABLED"
		principalFlag = "PRINCIPAL_INITIAL_SYNC_ENABLED"
	)

	setRequired := func(t *testing.T) {
		t.Helper()
		required := map[string]string{
			"DATABASE_URL":         "postgres://test:test@localhost/test?sslmode=disable",
			"JWT_SECRET":           "test-secret",
			"PROXMOX_URL":          "https://proxmox.test:8006",
			"PROXMOX_TOKEN_ID":     "test@pve!test",
			"PROXMOX_TOKEN_SECRET": "test-token-secret",
			"PROXMOX_NODES":        "node1",
			"PRINCIPAL_PROVIDER":   "proxmox",
		}
		for k, v := range required {
			t.Setenv(k, v)
		}
	}

	captureAndUnset := func(t *testing.T, name string) (wasSet bool, value string) {
		t.Helper()
		value, wasSet = os.LookupEnv(name)
		os.Unsetenv(name)
		t.Cleanup(func() {
			if wasSet {
				os.Setenv(name, value)
			} else {
				os.Unsetenv(name)
			}
		})
		return wasSet, value
	}

	t.Run("defaults to true when variables are absent", func(t *testing.T) {
		setRequired(t)
		captureAndUnset(t, proxmoxFlag)
		captureAndUnset(t, principalFlag)

		var cfg Config
		if err := envconfig.Process("", &cfg); err != nil {
			t.Fatalf("envconfig.Process failed: %v", err)
		}
		if !cfg.ProxmoxInitialSyncEnabled {
			t.Fatalf("ProxmoxInitialSyncEnabled = false, want true")
		}
		if !cfg.PrincipalInitialSyncEnabled {
			t.Fatalf("PrincipalInitialSyncEnabled = false, want true")
		}
	})

	t.Run("explicit false overrides defaults", func(t *testing.T) {
		setRequired(t)
		t.Setenv(proxmoxFlag, "false")
		t.Setenv(principalFlag, "false")

		var cfg Config
		if err := envconfig.Process("", &cfg); err != nil {
			t.Fatalf("envconfig.Process failed: %v", err)
		}
		if cfg.ProxmoxInitialSyncEnabled {
			t.Fatalf("ProxmoxInitialSyncEnabled = true, want false")
		}
		if cfg.PrincipalInitialSyncEnabled {
			t.Fatalf("PrincipalInitialSyncEnabled = true, want false")
		}
	})

	t.Run("malformed value returns error naming the variable", func(t *testing.T) {
		setRequired(t)
		t.Setenv(proxmoxFlag, "not-a-bool")
		captureAndUnset(t, principalFlag)

		var cfg Config
		err := envconfig.Process("", &cfg)
		if err == nil {
			t.Fatalf("expected error for malformed %s", proxmoxFlag)
		}
		if !strings.Contains(err.Error(), proxmoxFlag) {
			t.Fatalf("error = %q, want it to contain %q", err.Error(), proxmoxFlag)
		}
	})
}

func TestRunInitialSyncs(t *testing.T) {
	sentinelErr := errors.New("sync failed")

	tests := []struct {
		name                     string
		proxmoxEnabled           bool
		principalEnabled         bool
		principalNil             bool
		proxmoxErr               error
		principalErr             error
		wantProxmoxCalls         int
		wantPrincipalCalls       int
		wantProxmoxErrReturned   bool
		wantPrincipalErrReturned bool
	}{
		{
			name:               "both enabled calls both",
			proxmoxEnabled:     true,
			principalEnabled:   true,
			wantProxmoxCalls:   1,
			wantPrincipalCalls: 1,
		},
		{
			name:               "proxmox disabled skips proxmox only",
			proxmoxEnabled:     false,
			principalEnabled:   true,
			wantProxmoxCalls:   0,
			wantPrincipalCalls: 1,
		},
		{
			name:               "principal disabled skips principal only",
			proxmoxEnabled:     true,
			principalEnabled:   false,
			wantProxmoxCalls:   1,
			wantPrincipalCalls: 0,
		},
		{
			name:               "both disabled skips both",
			proxmoxEnabled:     false,
			principalEnabled:   false,
			wantProxmoxCalls:   0,
			wantPrincipalCalls: 0,
		},
		{
			name:               "nil principal sync safe and proxmox still runs",
			proxmoxEnabled:     true,
			principalEnabled:   true,
			principalNil:       true,
			wantProxmoxCalls:   1,
			wantPrincipalCalls: 0,
		},
		{
			name:               "proxmox error still attempts principal",
			proxmoxEnabled:     true,
			principalEnabled:   true,
			proxmoxErr:         sentinelErr,
			wantProxmoxCalls:   1,
			wantPrincipalCalls: 1,
		},
		{
			name:               "principal error still attempted",
			proxmoxEnabled:     true,
			principalEnabled:   true,
			principalErr:       sentinelErr,
			wantProxmoxCalls:   1,
			wantPrincipalCalls: 1,
		},
		{
			name:               "disabled principal with nil sync is safe",
			proxmoxEnabled:     true,
			principalEnabled:   false,
			principalNil:       true,
			wantProxmoxCalls:   1,
			wantPrincipalCalls: 0,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			var proxmoxCalls, principalCalls int

			proxmoxSync := func(ctx context.Context) error {
				proxmoxCalls++
				return tt.proxmoxErr
			}

			var principalSync func(context.Context) error
			if !tt.principalNil {
				principalSync = func(ctx context.Context) error {
					principalCalls++
					return tt.principalErr
				}
			}

			cfg := Config{
				ProxmoxInitialSyncEnabled:   tt.proxmoxEnabled,
				PrincipalInitialSyncEnabled: tt.principalEnabled,
			}

			runInitialSyncs(context.Background(), &cfg, proxmoxSync, principalSync)

			if proxmoxCalls != tt.wantProxmoxCalls {
				t.Fatalf("proxmox calls = %d, want %d", proxmoxCalls, tt.wantProxmoxCalls)
			}
			if principalCalls != tt.wantPrincipalCalls {
				t.Fatalf("principal calls = %d, want %d", principalCalls, tt.wantPrincipalCalls)
			}
		})
	}
}
