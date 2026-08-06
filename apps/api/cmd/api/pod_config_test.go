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

func TestResolvePersonalPodTemplatesFolderItemID(t *testing.T) {
	generalID := uuid.New()
	overrideID := uuid.New()

	got, err := resolvePersonalPodTemplatesFolderItemID("", generalID)
	if err != nil || got != generalID {
		t.Fatalf("blank override resolved to %s with error %v, want %s", got, err, generalID)
	}

	got, err = resolvePersonalPodTemplatesFolderItemID(overrideID.String(), generalID)
	if err != nil || got != overrideID {
		t.Fatalf("explicit override resolved to %s with error %v, want %s", got, err, overrideID)
	}

	if _, err := resolvePersonalPodTemplatesFolderItemID("invalid", generalID); err == nil {
		t.Fatal("invalid explicit override should return an error")
	}

	got, err = resolvePersonalPodTemplatesFolderItemID("", uuid.Nil)
	if err != nil || got != uuid.Nil {
		t.Fatalf("both blank resolved to %s with error %v, want uuid.Nil", got, err)
	}
}

func baseTestConfig() Config {
	return Config{
		PodLANVNet:                          "pod",
		PodDMZVNet:                          "dmz",
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
		PodRouterLANDMZCloudInitUserPattern: "kamino-router-lan-dmz-{network}-user-data.yaml",
		PodRouterLANDMZCloudInitNetworkFile: "kamino-router-lan-dmz-network-config.yaml",
		PersonalPodVNet:                     "personal",
		PersonalPodNetworkMin:               1,
		PersonalPodNetworkMax:               94,
		PersonalPodWANIPBase:                "172.25.",
		PersonalPodCloudInitUserFilePattern: "kamino-personal-router-{network}-user-data.yaml",
	}
}

func TestBuildPodRouterCloneConfig(t *testing.T) {
	tests := []struct {
		name    string
		config  Config
		wantErr string
		check   func(t *testing.T, cloneMin, cloneMax, devMin, devMax, personalMin, personalMax int32, lanVNet, dmzVNet, personalVNet string)
	}{
		{
			name:   "defaults valid: exact shared VNet IDs wire through unchanged",
			config: baseTestConfig(),
			check: func(t *testing.T, cloneMin, cloneMax, devMin, devMax, personalMin, personalMax int32, lanVNet, dmzVNet, personalVNet string) {
				if cloneMin != 1 || cloneMax != 174 {
					t.Fatalf("clone range = %d-%d, want 1-174", cloneMin, cloneMax)
				}
				if devMin != 175 || devMax != 199 {
					t.Fatalf("dev range = %d-%d, want 175-199", devMin, devMax)
				}
				if personalMin != 1 || personalMax != 94 {
					t.Fatalf("personal range = %d-%d, want 1-94", personalMin, personalMax)
				}
				if lanVNet != "pod" {
					t.Fatalf("LAN VNet = %q, want %q", lanVNet, "pod")
				}
				if dmzVNet != "dmz" {
					t.Fatalf("DMZ VNet = %q, want %q", dmzVNet, "dmz")
				}
				if personalVNet != "personal" {
					t.Fatalf("personal VNet = %q, want %q", personalVNet, "personal")
				}
			},
		},
		{
			name: "empty LAN VNet fails startup",
			config: func() Config {
				cfg := baseTestConfig()
				cfg.PodLANVNet = ""
				return cfg
			}(),
			wantErr: "POD_LAN_VNET must not be empty",
		},
		{
			name: "empty DMZ VNet fails startup",
			config: func() Config {
				cfg := baseTestConfig()
				cfg.PodDMZVNet = ""
				return cfg
			}(),
			wantErr: "POD_DMZ_VNET must not be empty",
		},
		{
			name: "empty personal VNet fails startup",
			config: func() Config {
				cfg := baseTestConfig()
				cfg.PersonalPodVNet = ""
				return cfg
			}(),
			wantErr: "PERSONAL_POD_VNET must not be empty",
		},
		{
			name: "malformed VNet ID fails startup",
			config: func() Config {
				cfg := baseTestConfig()
				cfg.PodLANVNet = "24pod"
				return cfg
			}(),
			wantErr: "must start with a letter",
		},
		{
			name: "too-long VNet ID fails startup",
			config: func() Config {
				cfg := baseTestConfig()
				cfg.PodDMZVNet = "waytoolongvnetid"
				return cfg
			}(),
			wantErr: "POD_DMZ_VNET must be at most 8 characters",
		},
		{
			name: "duplicate LAN/DMZ VNet IDs fail startup",
			config: func() Config {
				cfg := baseTestConfig()
				cfg.PodDMZVNet = cfg.PodLANVNet
				return cfg
			}(),
			wantErr: "POD_LAN_VNET and POD_DMZ_VNET must be distinct",
		},
		{
			name: "duplicate LAN/personal VNet IDs fail startup",
			config: func() Config {
				cfg := baseTestConfig()
				cfg.PersonalPodVNet = cfg.PodLANVNet
				return cfg
			}(),
			wantErr: "POD_LAN_VNET and PERSONAL_POD_VNET must be distinct",
		},
		{
			name: "duplicate DMZ/personal VNet IDs fail startup",
			config: func() Config {
				cfg := baseTestConfig()
				cfg.PersonalPodVNet = cfg.PodDMZVNet
				return cfg
			}(),
			wantErr: "POD_DMZ_VNET and PERSONAL_POD_VNET must be distinct",
		},
		{
			name: "enabled personal pods require a WAN bridge",
			config: func() Config {
				cfg := baseTestConfig()
				cfg.PersonalPodsEnabled = true
				cfg.PersonalPodWANBridge = "   "
				return cfg
			}(),
			wantErr: "PERSONAL_POD_WAN_BRIDGE must not be empty when PERSONAL_PODS_ENABLED is true",
		},
		{
			name: "enabled personal pods accept a WAN bridge",
			config: func() Config {
				cfg := baseTestConfig()
				cfg.PersonalPodsEnabled = true
				cfg.PersonalPodWANBridge = "  personalwan  "
				return cfg
			}(),
		},
		{
			name: "clone and dev ranges must not overlap",
			config: func() Config {
				cfg := baseTestConfig()
				cfg.PodDevNetworkMin = 100
				cfg.PodDevNetworkMax = 200
				return cfg
			}(),
			wantErr: "must not overlap",
		},
		{
			name: "personal range may overlap clone/dev ranges: bases no longer exist",
			config: func() Config {
				cfg := baseTestConfig()
				cfg.PersonalPodNetworkMin = 1
				cfg.PersonalPodNetworkMax = 174
				return cfg
			}(),
			check: func(t *testing.T, _, _, _, _, personalMin, personalMax int32, _, _, _ string) {
				if personalMin != 1 || personalMax != 174 {
					t.Fatalf("personal range = %d-%d, want 1-174", personalMin, personalMax)
				}
			},
		},
		{
			name: "clone network max above 254 rejected",
			config: func() Config {
				cfg := baseTestConfig()
				cfg.PodCloneNetworkMax = 255
				return cfg
			}(),
			wantErr: "POD_CLONE_NETWORK_MAX must be at most 254",
		},
		{
			name: "personal network max above 254 rejected",
			config: func() Config {
				cfg := baseTestConfig()
				cfg.PersonalPodNetworkMax = 255
				return cfg
			}(),
			wantErr: "PERSONAL_POD_NETWORK_MAX must be at most 254",
		},
		{
			name: "network number min below 1 rejected",
			config: func() Config {
				cfg := baseTestConfig()
				cfg.PodCloneNetworkMin = 0
				return cfg
			}(),
			wantErr: "POD_CLONE_NETWORK_MIN must be at least 1",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			routerConfig, err := buildPodRouterCloneConfig(&tt.config)
			if tt.wantErr != "" {
				if err == nil {
					t.Fatalf("expected error containing %q", tt.wantErr)
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
					routerConfig.LANVNet,
					routerConfig.DMZVNet,
					routerConfig.PersonalVNet,
				)
			}
		})
	}
}

func TestBuildPodRouterCloneConfigCarriesCloneTargetSeedFields(t *testing.T) {
	cfg := baseTestConfig()
	cfg.PodRouterWANBridge = "vmbr7"
	routerConfig, err := buildPodRouterCloneConfig(&cfg)
	if err != nil {
		t.Fatalf("buildPodRouterCloneConfig() error = %v", err)
	}

	if routerConfig.WANBridge != "vmbr7" {
		t.Fatalf("WANBridge = %q, want %q", routerConfig.WANBridge, "vmbr7")
	}
	if routerConfig.LANVNet == "" || routerConfig.DMZVNet == "" || routerConfig.WANIPBase == "" {
		t.Fatalf("clone target seed fields incomplete: %#v", routerConfig)
	}
}
