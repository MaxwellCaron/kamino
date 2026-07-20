package main

import (
	"strings"
	"testing"

	"github.com/google/uuid"
)

func TestResolvePersonalPodRouterTemplateItemID(t *testing.T) {
	defaultID := uuid.New()
	overrideID := uuid.New()

	got, err := resolvePersonalPodRouterTemplateItemID(true, "", defaultID)
	if err != nil || got != defaultID {
		t.Fatalf("blank override resolved to %s with error %v, want %s", got, err, defaultID)
	}

	got, err = resolvePersonalPodRouterTemplateItemID(true, overrideID.String(), defaultID)
	if err != nil || got != overrideID {
		t.Fatalf("explicit override resolved to %s with error %v, want %s", got, err, overrideID)
	}

	if _, err := resolvePersonalPodRouterTemplateItemID(false, "invalid", defaultID); err == nil {
		t.Fatal("invalid explicit override should return an error")
	}

	got, err = resolvePersonalPodRouterTemplateItemID(false, "", uuid.Nil)
	if err != nil || got != uuid.Nil {
		t.Fatalf("disabled personal pods without a template resolved to %s with error %v", got, err)
	}

	if _, err := resolvePersonalPodRouterTemplateItemID(true, "", uuid.Nil); err == nil {
		t.Fatal("enabled personal pods without a router template should return an error")
	}
}

func TestBuildPodRouterCloneConfig(t *testing.T) {
	baseConfig := func() Config {
		return Config{
			PodCloneVNetPrefix:                  "pod",
			PodLANVLANBase:                      0,
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
			PersonalPodNetworkMin:               1,
			PersonalPodNetworkMax:               94,
			PersonalPodVLANBase:                 4000,
			PersonalPodWANIPBase:                "172.25.",
			PersonalPodCloudInitUserFilePattern: "kamino-personal-router-{network}-user-data.yaml",
		}
	}

	tests := []struct {
		name    string
		config  Config
		wantErr string
		check   func(t *testing.T, cloneMin, cloneMax, devMin, devMax, personalMin, personalMax int32, personalVLANBase int)
	}{
		{
			name:   "defaults valid",
			config: baseConfig(),
			check: func(t *testing.T, cloneMin, cloneMax, devMin, devMax, personalMin, personalMax int32, personalVLANBase int) {
				if cloneMin != 1 || cloneMax != 174 {
					t.Fatalf("clone range = %d-%d, want 1-174", cloneMin, cloneMax)
				}
				if devMin != 175 || devMax != 199 {
					t.Fatalf("dev range = %d-%d, want 175-199", devMin, devMax)
				}
				if personalMin != 1 || personalMax != 94 {
					t.Fatalf("personal range = %d-%d, want 1-94", personalMin, personalMax)
				}
				if personalVLANBase != 4000 {
					t.Fatalf("personal VLAN base = %d, want 4000", personalVLANBase)
				}
			},
		},
		{
			name: "overlapping personal and LAN VLAN ranges rejected",
			config: func() Config {
				cfg := baseConfig()
				cfg.PersonalPodVLANBase = 0
				cfg.PersonalPodNetworkMin = 190
				cfg.PersonalPodNetworkMax = 210
				return cfg
			}(),
			wantErr: "personal pod and LAN VLAN tag ranges must not overlap",
		},
		{
			name: "distinct personal base and pattern allow network number overlap",
			config: func() Config {
				cfg := baseConfig()
				cfg.PersonalPodVLANBase = 2000
				cfg.PersonalPodCloudInitUserFilePattern = "personal-router-{network}-user-data.yaml"
				cfg.PersonalPodNetworkMin = 190
				cfg.PersonalPodNetworkMax = 210
				return cfg
			}(),
		},
		{
			name: "personal base 4000 supports VLANs through 4094",
			config: func() Config {
				cfg := baseConfig()
				cfg.PersonalPodVLANBase = 4000
				cfg.PersonalPodNetworkMin = 1
				cfg.PersonalPodNetworkMax = 94
				cfg.PersonalPodCloudInitUserFilePattern = "kamino-personal-router-{network}-user-data.yaml"
				return cfg
			}(),
			check: func(t *testing.T, _, _, _, _, personalMin, personalMax int32, personalVLANBase int) {
				if personalMin != 1 || personalMax != 94 {
					t.Fatalf("personal range = %d-%d, want 1-94", personalMin, personalMax)
				}
				if personalVLANBase != 4000 {
					t.Fatalf("personal VLAN base = %d, want 4000", personalVLANBase)
				}
			},
		},
		{
			name: "personal VLAN tags above 4094 rejected",
			config: func() Config {
				cfg := baseConfig()
				cfg.PersonalPodVLANBase = 4000
				cfg.PersonalPodNetworkMin = 1
				cfg.PersonalPodNetworkMax = 95
				cfg.PersonalPodCloudInitUserFilePattern = "kamino-personal-router-{network}-user-data.yaml"
				return cfg
			}(),
			wantErr: "derived personal pod VLAN tags must be within 1..4094",
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
					routerConfig.PersonalVLANBase,
				)
			}
		})
	}
}
