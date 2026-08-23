package main

import (
	"strings"
	"testing"
)

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
