package main

import (
	"context"
	"errors"
	"os"
	"strings"
	"testing"

	"github.com/kelseyhightower/envconfig"
)

func TestBuildPodRouterCloneConfig(t *testing.T) {
	baseConfig := func() Config {
		return Config{
			PodCloneVNetPrefix:                "pod",
			PodCloneNetworkMin:                1,
			PodCloneNetworkMax:                174,
			PodDevNetworkMin:                  175,
			PodDevNetworkMax:                  199,
			PodRouterWait:                     "5m",
			PodRouterWANIPBase:                "172.16.",
			PodRouterInternalSubnet:           "192.168.1.0/24",
			PodRouterCloudInitStorage:         "local",
			PodRouterCloudInitUserFilePattern: "kamino-router-{network}-user-data.yaml",
			PodRouterCloudInitNetworkFile:     "kamino-router-network-config.yaml",
			PersonalPodNetworkMin:             200,
			PersonalPodNetworkMax:             254,
		}
	}

	tests := []struct {
		name    string
		config  Config
		wantErr string
		check   func(t *testing.T, cloneMin, cloneMax, devMin, devMax, personalMin, personalMax int32)
	}{
		{
			name:   "defaults valid",
			config: baseConfig(),
			check: func(t *testing.T, cloneMin, cloneMax, devMin, devMax, personalMin, personalMax int32) {
				if cloneMin != 1 || cloneMax != 174 {
					t.Fatalf("clone range = %d-%d, want 1-174", cloneMin, cloneMax)
				}
				if devMin != 175 || devMax != 199 {
					t.Fatalf("dev range = %d-%d, want 175-199", devMin, devMax)
				}
				if personalMin != 200 || personalMax != 254 {
					t.Fatalf("personal range = %d-%d, want 200-254", personalMin, personalMax)
				}
			},
		},
		{
			name: "shared prefix overlap rejected",
			config: func() Config {
				cfg := baseConfig()
				cfg.PersonalPodNetworkMin = 190
				cfg.PersonalPodNetworkMax = 210
				return cfg
			}(),
			wantErr: "PERSONAL_POD_NETWORK_MIN..PERSONAL_POD_NETWORK_MAX must not overlap pod ranges when PERSONAL_POD_VNET_PREFIX matches POD_CLONE_VNET_PREFIX",
		},
		{
			name: "distinct prefix and pattern allow overlap",
			config: func() Config {
				cfg := baseConfig()
				cfg.PersonalPodVNetPrefix = "pp"
				cfg.PersonalPodCloudInitUserFilePattern = "personal-router-{network}-user-data.yaml"
				cfg.PersonalPodNetworkMin = 190
				cfg.PersonalPodNetworkMax = 210
				return cfg
			}(),
		},
		{
			name: "personal prefix too long",
			config: func() Config {
				cfg := baseConfig()
				cfg.PersonalPodVNetPrefix = "personal"
				return cfg
			}(),
			wantErr: "PERSONAL_POD_VNET_PREFIX plus configured network number must fit Proxmox VNet 8-character limit",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			routerConfig, err := buildPodRouterCloneConfig(&tt.config)
			if tt.wantErr != "" {
				if err == nil {
					t.Fatalf("expected error %q", tt.wantErr)
				}
				if !strings.Contains(err.Error(), tt.wantErr) {
					t.Fatalf("error = %q, want substring %q", err.Error(), tt.wantErr)
				}
				return
			}
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			if tt.check != nil {
				tt.check(
					t,
					routerConfig.NetworkMin,
					routerConfig.NetworkMax,
					routerConfig.DevNetworkMin,
					routerConfig.DevNetworkMax,
					routerConfig.PersonalNetworkMin,
					routerConfig.PersonalNetworkMax,
				)
			}
		})
	}
}

func TestBuildVMIDRangeConfig(t *testing.T) {
	baseConfig := func() Config {
		return Config{
			PodPublishVMIDMin:  1000,
			PodPublishVMIDMax:  1999,
			PodCloneVMIDMin:    2000,
			PodCloneVMIDMax:    9999,
			PodDevVMIDMin:      10000,
			PodDevVMIDMax:      19999,
			PersonalPodVMIDMin: 20000,
			PersonalPodVMIDMax: 20999,
		}
	}

	tests := []struct {
		name    string
		config  Config
		wantErr string
		check   func(t *testing.T, r vmidRanges)
	}{
		{
			name:   "defaults valid",
			config: baseConfig(),
			check: func(t *testing.T, r vmidRanges) {
				t.Helper()
				if r.Publish.Min != 1000 || r.Publish.Max != 1999 {
					t.Errorf("publish = %d-%d, want 1000-1999", r.Publish.Min, r.Publish.Max)
				}
				if r.Clone.Min != 2000 || r.Clone.Max != 9999 {
					t.Errorf("clone = %d-%d, want 2000-9999", r.Clone.Min, r.Clone.Max)
				}
				if r.Dev.Min != 10000 || r.Dev.Max != 19999 {
					t.Errorf("dev = %d-%d, want 10000-19999", r.Dev.Min, r.Dev.Max)
				}
				if r.Personal.Min != 20000 || r.Personal.Max != 20999 {
					t.Errorf("personal = %d-%d, want 20000-20999", r.Personal.Min, r.Personal.Max)
				}
			},
		},
		{
			name: "min below proxmox lower bound rejected",
			config: func() Config {
				cfg := baseConfig()
				cfg.PodPublishVMIDMin = 99
				return cfg
			}(),
			wantErr: "POD_PUBLISH_VMID_MIN must be at least 100",
		},
		{
			name: "max above proxmox upper bound rejected",
			config: func() Config {
				cfg := baseConfig()
				cfg.PersonalPodVMIDMax = 1000000000
				return cfg
			}(),
			wantErr: "PERSONAL_POD_VMID_MAX must be at most 999999999",
		},
		{
			name: "reversed bounds rejected",
			config: func() Config {
				cfg := baseConfig()
				cfg.PodCloneVMIDMin = 5000
				cfg.PodCloneVMIDMax = 4000
				return cfg
			}(),
			wantErr: "POD_CLONE_VMID_MIN must be less than or equal to POD_CLONE_VMID_MAX",
		},
		{
			name: "publish-clone overlap rejected",
			config: func() Config {
				cfg := baseConfig()
				cfg.PodPublishVMIDMax = 2500
				return cfg
			}(),
			wantErr: "must not overlap",
		},
		{
			name: "clone-dev overlap rejected",
			config: func() Config {
				cfg := baseConfig()
				cfg.PodCloneVMIDMax = 10500
				return cfg
			}(),
			wantErr: "must not overlap",
		},
		{
			name: "dev-personal overlap rejected",
			config: func() Config {
				cfg := baseConfig()
				cfg.PodDevVMIDMax = 20500
				return cfg
			}(),
			wantErr: "must not overlap",
		},
		{
			name: "publish-dev overlap rejected",
			config: func() Config {
				cfg := baseConfig()
				cfg.PodPublishVMIDMin = 10000
				cfg.PodPublishVMIDMax = 10500
				return cfg
			}(),
			wantErr: "must not overlap",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			r, err := buildVMIDRangeConfig(&tt.config)
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
			if tt.check != nil {
				tt.check(t, r)
			}
		})
	}
}

func TestInitialSyncConfig(t *testing.T) {
	const (
		proxmoxFlag = "PROXMOX_INITIAL_SYNC_ENABLED"
		adFlag      = "AD_INITIAL_SYNC_ENABLED"
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
		captureAndUnset(t, adFlag)

		var cfg Config
		if err := envconfig.Process("", &cfg); err != nil {
			t.Fatalf("envconfig.Process failed: %v", err)
		}
		if !cfg.ProxmoxInitialSyncEnabled {
			t.Fatalf("ProxmoxInitialSyncEnabled = false, want true")
		}
		if !cfg.ADInitialSyncEnabled {
			t.Fatalf("ADInitialSyncEnabled = false, want true")
		}
	})

	t.Run("explicit false overrides defaults", func(t *testing.T) {
		setRequired(t)
		t.Setenv(proxmoxFlag, "false")
		t.Setenv(adFlag, "false")

		var cfg Config
		if err := envconfig.Process("", &cfg); err != nil {
			t.Fatalf("envconfig.Process failed: %v", err)
		}
		if cfg.ProxmoxInitialSyncEnabled {
			t.Fatalf("ProxmoxInitialSyncEnabled = true, want false")
		}
		if cfg.ADInitialSyncEnabled {
			t.Fatalf("ADInitialSyncEnabled = true, want false")
		}
	})

	t.Run("malformed value returns error naming the variable", func(t *testing.T) {
		setRequired(t)
		t.Setenv(proxmoxFlag, "not-a-bool")
		captureAndUnset(t, adFlag)

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
		name                   string
		proxmoxEnabled         bool
		adEnabled              bool
		adNil                  bool
		proxmoxErr             error
		adErr                  error
		wantProxmoxCalls       int
		wantADCalls            int
		wantProxmoxErrReturned bool
		wantADErrReturned      bool
	}{
		{
			name:             "both enabled calls both",
			proxmoxEnabled:   true,
			adEnabled:        true,
			wantProxmoxCalls: 1,
			wantADCalls:      1,
		},
		{
			name:             "proxmox disabled skips proxmox only",
			proxmoxEnabled:   false,
			adEnabled:        true,
			wantProxmoxCalls: 0,
			wantADCalls:      1,
		},
		{
			name:             "ad disabled skips ad only",
			proxmoxEnabled:   true,
			adEnabled:        false,
			wantProxmoxCalls: 1,
			wantADCalls:      0,
		},
		{
			name:             "both disabled skips both",
			proxmoxEnabled:   false,
			adEnabled:        false,
			wantProxmoxCalls: 0,
			wantADCalls:      0,
		},
		{
			name:             "nil ad sync safe and proxmox still runs",
			proxmoxEnabled:   true,
			adEnabled:        true,
			adNil:            true,
			wantProxmoxCalls: 1,
			wantADCalls:      0,
		},
		{
			name:             "proxmox error still attempts ad",
			proxmoxEnabled:   true,
			adEnabled:        true,
			proxmoxErr:       sentinelErr,
			wantProxmoxCalls: 1,
			wantADCalls:      1,
		},
		{
			name:             "ad error still attempted",
			proxmoxEnabled:   true,
			adEnabled:        true,
			adErr:            sentinelErr,
			wantProxmoxCalls: 1,
			wantADCalls:      1,
		},
		{
			name:             "disabled ad with nil sync is safe",
			proxmoxEnabled:   true,
			adEnabled:        false,
			adNil:            true,
			wantProxmoxCalls: 1,
			wantADCalls:      0,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			var proxmoxCalls, adCalls int

			proxmoxSync := func(ctx context.Context) error {
				proxmoxCalls++
				return tt.proxmoxErr
			}

			var adSync func(context.Context) error
			if !tt.adNil {
				adSync = func(ctx context.Context) error {
					adCalls++
					return tt.adErr
				}
			}

			cfg := Config{
				ProxmoxInitialSyncEnabled: tt.proxmoxEnabled,
				ADInitialSyncEnabled:      tt.adEnabled,
			}

			runInitialSyncs(context.Background(), &cfg, proxmoxSync, adSync)

			if proxmoxCalls != tt.wantProxmoxCalls {
				t.Fatalf("proxmox calls = %d, want %d", proxmoxCalls, tt.wantProxmoxCalls)
			}
			if adCalls != tt.wantADCalls {
				t.Fatalf("ad calls = %d, want %d", adCalls, tt.wantADCalls)
			}
		})
	}
}
