package main

import (
	"strings"
	"testing"
)

func TestBuildPodRouterCloneConfig(t *testing.T) {
	baseConfig := func() Config {
		return Config{
			PodCloneVNetPrefix:                  "pod",
			PodCloneNetworkMin:                  1,
			PodCloneNetworkMax:                  174,
			PodDevNetworkMin:                    175,
			PodDevNetworkMax:                    199,
			PodRouterWait:                       "5m",
			PodRouterWANIPBase:                  "172.16.",
			PodRouterInternalSubnet:             "192.168.1.0/24",
			PodRouterCloudInitStorage:           "local",
			PodRouterCloudInitUserFilePattern:   "kamino-router-{network}-user-data.yaml",
			PodRouterCloudInitNetworkFile:       "kamino-router-network-config.yaml",
			PodDMZVNetPrefix:                    "dmz",
			PodDMZVLANBase:                      1000,
			PodRouterLANDMZCloudInitUserPattern: "kamino-router-lan-dmz-{network}-user-data.yaml",
			PodRouterLANDMZCloudInitNetworkFile: "kamino-router-lan-dmz-network-config.yaml",
			PersonalPodNetworkMin:               200,
			PersonalPodNetworkMax:               254,
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
			name: "overlapping LAN and DMZ VLAN ranges rejected",
			config: func() Config {
				cfg := baseConfig()
				cfg.PodLANVLANBase = 900
				return cfg
			}(),
			wantErr: "LAN and DMZ VLAN tag ranges must not overlap",
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
