package proxmox

import (
	"testing"

	"github.com/google/uuid"
)

func TestParseLXCConfigSummary(t *testing.T) {
	tests := []struct {
		name    string
		data    map[string]any
		vmid    int
		want    *VMConfigSummary
		wantErr bool
	}{
		{
			name: "hostname present",
			data: map[string]any{
				"hostname": "web-01",
				"cores":    2,
				"memory":   2048,
				"rootfs":   "local-lvm:vm-616-disk-0,size=8G",
			},
			vmid: 616,
			want: &VMConfigSummary{
				Name:         "web-01",
				IsTemplate:   false,
				UpstreamUUID: lxcUpstreamUUID(616),
				CPUCount:     2,
				MemoryMB:     2048,
				DiskGB:       8,
			},
		},
		{
			name: "hostname absent falls back to CT vmid",
			data: map[string]any{
				"memory": 512,
				"rootfs": "local-lvm:vm-100-disk-0,size=4G",
			},
			vmid: 100,
			want: &VMConfigSummary{
				Name:         "CT 100",
				IsTemplate:   false,
				UpstreamUUID: lxcUpstreamUUID(100),
				CPUCount:     1,
				MemoryMB:     512,
				DiskGB:       4,
			},
		},
		{
			name: "template flag",
			data: map[string]any{
				"hostname": "tpl-ct",
				"template": 1,
				"rootfs":   "local-lvm:vm-200-disk-0,size=2G",
			},
			vmid: 200,
			want: &VMConfigSummary{
				Name:         "tpl-ct",
				IsTemplate:   true,
				UpstreamUUID: lxcUpstreamUUID(200),
				CPUCount:     1,
				MemoryMB:     0,
				DiskGB:       2,
			},
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			got, err := parseLXCConfigSummary(tc.data, tc.vmid)
			if tc.wantErr {
				if err == nil {
					t.Fatal("parseLXCConfigSummary() expected error")
				}
				return
			}
			if err != nil {
				t.Fatalf("parseLXCConfigSummary() error = %v", err)
			}
			if got.Name != tc.want.Name ||
				got.IsTemplate != tc.want.IsTemplate ||
				got.UpstreamUUID != tc.want.UpstreamUUID ||
				got.CPUCount != tc.want.CPUCount ||
				got.MemoryMB != tc.want.MemoryMB ||
				got.DiskGB != tc.want.DiskGB {
				t.Fatalf("parseLXCConfigSummary() = %+v, want %+v", got, tc.want)
			}
		})
	}
}

func TestLXCUpstreamUUIDDeterministic(t *testing.T) {
	first := lxcUpstreamUUID(616)
	second := lxcUpstreamUUID(616)
	other := lxcUpstreamUUID(617)

	if first != second {
		t.Fatalf("same vmid produced different UUIDs: %s vs %s", first, second)
	}
	if first == other {
		t.Fatalf("different vmids produced same UUID: %s", first)
	}
	if first == uuid.Nil {
		t.Fatal("lxcUpstreamUUID returned nil UUID")
	}
}

func TestParseLXCNetworks(t *testing.T) {
	networks, err := parseLXCNetworks(map[string]any{
		"rootfs": "local-lvm:vm-1-disk-0,size=8G",
		"net0":   "name=eth0,bridge=vmbr0,hwaddr=BC:24:11:AA:BB:CC,ip=dhcp,tag=10,firewall=1",
	})
	if err != nil {
		t.Fatalf("parseLXCNetworks() error = %v", err)
	}
	if len(networks) != 1 {
		t.Fatalf("parseLXCNetworks() len = %d, want 1", len(networks))
	}

	got := networks[0]
	if got.Device != "net0" || got.Bridge != "vmbr0" || got.Model != "veth" {
		t.Fatalf("unexpected network identity: %+v", got)
	}
	if got.MACAddress != "BC:24:11:AA:BB:CC" {
		t.Fatalf("MACAddress = %q", got.MACAddress)
	}
	if got.VLANTag == nil || *got.VLANTag != 10 {
		t.Fatalf("VLANTag = %v, want 10", got.VLANTag)
	}
	if !got.Firewall {
		t.Fatal("expected firewall enabled")
	}
}
